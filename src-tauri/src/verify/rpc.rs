//! Reading a transaction from XRPL nodes.
//!
//! Where requests may go is decided here, not by the caller: the command
//! names a network, and only the endpoints listed for it are contacted.
//! There is no way to pass a URL in from the web view.
//!
//! Every read is bounded: connect and total timeouts, no redirects, a size
//! cap enforced while the body streams in (so a hostile node cannot make
//! the app buffer gigabytes), compressed bodies refused rather than
//! inflated, and a small number of retries with backoff and jitter for the
//! failures that are worth retrying (timeouts, 5xx, 429, a busy node).

use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::Serialize;
use serde_json::{json, Value};

use super::model::Network;
use super::verifier::{observe, SourceRead};

/// A node this engine may read from, and who operates it. Two reads count
/// as independent only when their operators differ.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Endpoint {
    pub name: String,
    pub operator: String,
    pub url: String,
}

fn ep(name: &str, operator: &str, url: &str) -> Endpoint {
    Endpoint {
        name: name.into(),
        operator: operator.into(),
        url: url.into(),
    }
}

/// The allowlist. xrplcluster.com and s2.ripple.com keep full history, so
/// they come first; s1.ripple.com keeps recent ledgers only.
pub fn endpoints(network: Network) -> Vec<Endpoint> {
    match network {
        Network::Mainnet => vec![
            ep("xrplcluster.com", "XRPL Labs", "https://xrplcluster.com/"),
            ep("s2.ripple.com", "Ripple", "https://s2.ripple.com:51234/"),
            ep("s1.ripple.com", "Ripple", "https://s1.ripple.com:51234/"),
        ],
        Network::Testnet => vec![
            ep(
                "s.altnet.rippletest.net",
                "Ripple",
                "https://s.altnet.rippletest.net:51234/",
            ),
            ep(
                "testnet.xrpl-labs.com",
                "XRPL Labs",
                "https://testnet.xrpl-labs.com/",
            ),
        ],
    }
}

/// One endpoint per operator, in allowlist order, at most `n` of them.
pub fn independent(network: Network, n: usize) -> Vec<Endpoint> {
    let mut out: Vec<Endpoint> = vec![];
    for e in endpoints(network) {
        if out.len() < n && !out.iter().any(|o| o.operator == e.operator) {
            out.push(e);
        }
    }
    out
}

#[derive(Clone, Copy, Debug)]
pub struct Limits {
    pub connect_timeout: Duration,
    pub request_timeout: Duration,
    pub max_body_bytes: usize,
    pub max_attempts: u32,
    pub base_backoff: Duration,
    pub max_retry_after: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            connect_timeout: Duration::from_secs(5),
            request_timeout: Duration::from_secs(12),
            // A `tx` reply is a few kilobytes; a megabyte is generous.
            max_body_bytes: 1024 * 1024,
            max_attempts: 3,
            base_backoff: Duration::from_millis(300),
            max_retry_after: Duration::from_secs(5),
        }
    }
}

/// What it took to get an answer from one source.
#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
pub struct FetchStats {
    pub source: String,
    pub attempts: u32,
    pub latency_ms: u64,
    pub last_error: Option<String>,
}

/// A client with this module's rules: ring for TLS (the provider already
/// compiled in), the limits' timeouts, and no redirects, so an allowlisted
/// endpoint cannot hand the request on to somewhere else.
pub fn build_client(limits: &Limits) -> reqwest::Client {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .connect_timeout(limits.connect_timeout)
        .timeout(limits.request_timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("HTTP client")
}

pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| build_client(&Limits::default()))
}

/// ISO-8601 UTC with milliseconds, from the system clock.
pub fn now_iso() -> String {
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    iso_from_millis(d.as_millis() as i64)
}

pub fn iso_from_millis(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let millis = ms.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Jitter without a random-number dependency: the low bits of the clock.
fn jitter(max: Duration) -> Duration {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0) as u64;
    let cap = max.as_millis().max(1) as u64;
    Duration::from_millis(nanos % cap)
}

enum Attempt {
    Done(Value),
    Retry(String, Option<Duration>),
    Fail(String),
}

async fn read_bounded(resp: reqwest::Response, max: usize) -> Result<Vec<u8>, String> {
    if let Some(len) = resp.content_length() {
        if len as usize > max {
            return Err(format!(
                "response of {len} bytes exceeds the {max}-byte limit"
            ));
        }
    }
    let mut body = Vec::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("reading the response failed: {}", short(&e)))?;
        if body.len() + chunk.len() > max {
            return Err(format!(
                "response exceeds the {max}-byte limit; reading stopped"
            ));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/// Error text without URLs or headers in it.
fn short(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "timed out".into()
    } else if e.is_connect() {
        "could not connect".into()
    } else if e.is_body() || e.is_decode() {
        "response body could not be read".into()
    } else {
        "request failed".into()
    }
}

async fn attempt(client: &reqwest::Client, url: &str, hash: &str, limits: &Limits) -> Attempt {
    let body = json!({ "method": "tx", "params": [{ "transaction": hash, "binary": false, "api_version": 2 }] });
    let resp = match client
        .post(url)
        .header("accept-encoding", "identity")
        .timeout(limits.request_timeout)
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) if e.is_timeout() || e.is_connect() => return Attempt::Retry(short(&e), None),
        Err(e) => return Attempt::Fail(short(&e)),
    };
    let status = resp.status();
    if status.as_u16() == 429 {
        let wait = resp
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<u64>().ok())
            .map(|s| Duration::from_secs(s).min(limits.max_retry_after));
        return Attempt::Retry("rate limited (HTTP 429)".into(), wait);
    }
    if status.is_server_error() {
        return Attempt::Retry(format!("HTTP {}", status.as_u16()), None);
    }
    if !status.is_success() {
        return Attempt::Fail(format!("HTTP {}", status.as_u16()));
    }
    if let Some(enc) = resp
        .headers()
        .get("content-encoding")
        .and_then(|v| v.to_str().ok())
    {
        if !enc.eq_ignore_ascii_case("identity") {
            return Attempt::Fail(format!("compressed response ({enc}) refused"));
        }
    }
    let bytes = match read_bounded(resp, limits.max_body_bytes).await {
        Ok(b) => b,
        Err(e) => return Attempt::Fail(e),
    };
    let parsed: Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => return Attempt::Fail("response is not valid JSON".into()),
    };
    let Some(result) = parsed.get("result").cloned() else {
        return Attempt::Fail("JSON-RPC response has no result".into());
    };
    if let Some(code) = result.get("error").and_then(Value::as_str) {
        if matches!(
            code,
            "slowDown" | "tooBusy" | "noNetwork" | "noCurrent" | "noClosed"
        ) {
            return Attempt::Retry(format!("node busy ({code})"), None);
        }
    }
    Attempt::Done(result)
}

/// Read one transaction from one endpoint, with retries.
pub async fn fetch_tx(
    client: &reqwest::Client,
    endpoint: &Endpoint,
    hash: &str,
    limits: &Limits,
) -> (SourceRead, FetchStats) {
    let started = Instant::now();
    let mut stats = FetchStats {
        source: endpoint.name.clone(),
        ..Default::default()
    };
    let mut last = String::new();
    for n in 0..limits.max_attempts {
        stats.attempts = n + 1;
        match attempt(client, &endpoint.url, hash, limits).await {
            Attempt::Done(result) => {
                stats.latency_ms = started.elapsed().as_millis() as u64;
                return (observe(&endpoint.name, &now_iso(), &result), stats);
            }
            Attempt::Fail(e) => {
                last = e;
                break;
            }
            Attempt::Retry(e, wait) => {
                last = e;
                if n + 1 < limits.max_attempts {
                    let backoff = wait.unwrap_or(limits.base_backoff * 2u32.pow(n))
                        + jitter(limits.base_backoff);
                    tokio::time::sleep(backoff).await;
                }
            }
        }
    }
    stats.latency_ms = started.elapsed().as_millis() as u64;
    stats.last_error = Some(last.clone());
    (
        SourceRead::Failed {
            source: endpoint.name.clone(),
            observed_at: now_iso(),
            error: last,
        },
        stats,
    )
}

/// Read from each endpoint concurrently (the list is at most a few long).
pub async fn fetch_all(
    client: &reqwest::Client,
    eps: &[Endpoint],
    hash: &str,
    limits: &Limits,
) -> Vec<(SourceRead, FetchStats)> {
    futures_util::future::join_all(eps.iter().map(|e| fetch_tx(client, e, hash, limits))).await
}
