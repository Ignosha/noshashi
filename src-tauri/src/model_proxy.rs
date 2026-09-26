// Model requests, made from Rust rather than from the web view.
//
// Three problems had one cause. The web view's CSP lists each model host
// by name, so a custom endpoint could never be reached; hosted providers
// that do not send CORS headers failed in the web view however the key
// was set; and every request needed the API key in JavaScript. Making the
// request here removes all three: reqwest is not subject to the CSP or to
// CORS, and the key goes from the OS keyring to the TLS connection
// without the web view ever holding it.
//
// The web view still decides what to ask (URL path, body, streaming); this
// module decides where a key may go and adds it. A key for a named hosted
// provider is sent only to that provider's own host. A custom endpoint
// receives only the key stored for "custom". Local runtimes never receive
// a key at all.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio::sync::watch;

use crate::provider_key;

/// Hosted providers whose key may only travel to their own API host.
const PINNED_HOSTS: &[(&str, &str)] = &[
    ("anthropic", "api.anthropic.com"),
    ("openai", "api.openai.com"),
    ("groq", "api.groq.com"),
    ("openrouter", "openrouter.ai"),
    ("deepseek", "api.deepseek.com"),
    ("mistral", "api.mistral.ai"),
];

/// Headers the web view may add beyond the ones set here. Everything else
/// (authorization above all) is decided in Rust.
const PASSTHROUGH_HEADERS: &[&str] = &["anthropic-beta"];

const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRequest {
    /// Chosen by the caller so it can cancel this request.
    id: String,
    provider: String,
    /// Wire format: "anthropic", "openai" or "ollama".
    api: String,
    url: String,
    method: String,
    body: Option<String>,
    #[serde(default)]
    stream: bool,
    #[serde(default)]
    headers: HashMap<String, String>,
}

#[derive(Serialize)]
pub struct ModelResponse {
    status: u16,
    /// The whole body for a non-streamed request, or for a streamed one
    /// that failed before streaming began. Empty after a streamed success.
    body: String,
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        // reqwest is built without a bundled crypto provider (the updater
        // made the same choice); ring is the one already compiled in.
        if rustls::crypto::CryptoProvider::get_default().is_none() {
            let _ = rustls::crypto::ring::default_provider().install_default();
        }
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            // A model thinking through a hard question can take minutes;
            // a silent socket is what this bounds, not a slow answer.
            .read_timeout(Duration::from_secs(300))
            .build()
            .expect("HTTP client")
    })
}

/// Cancellation senders for in-flight requests, by request id.
fn inflight() -> &'static Mutex<HashMap<String, watch::Sender<bool>>> {
    static MAP: OnceLock<Mutex<HashMap<String, watch::Sender<bool>>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn is_loopback(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "[::1]" | "::1")
}

/// Checks the target and returns whether a key may be attached to it.
fn check_target(provider: &str, url: &url::Url) -> Result<bool, String> {
    let host = url.host_str().ok_or("The endpoint has no host.")?;
    match url.scheme() {
        "https" => {}
        "http" if is_loopback(host) => {}
        _ => {
            return Err(
                "Remote endpoints must use HTTPS. Plaintext would expose the request in transit."
                    .into(),
            )
        }
    }

    if let Some((_, pinned)) = PINNED_HOSTS.iter().find(|(id, _)| *id == provider) {
        if host != *pinned {
            return Err(format!(
                "A {provider} key is only ever sent to {pinned}. Use the Custom endpoint for other hosts."
            ));
        }
        return Ok(true);
    }
    // A custom endpoint carries the "custom" key, over TLS only.
    Ok(provider == "custom" && url.scheme() == "https")
}

fn auth_headers(api: &str, key: &str) -> Vec<(&'static str, String)> {
    if api == "anthropic" {
        vec![
            ("x-api-key", key.to_string()),
            ("anthropic-version", ANTHROPIC_VERSION.to_string()),
        ]
    } else {
        vec![("authorization", format!("Bearer {key}"))]
    }
}

/// Complete UTF-8 prefix of `pending`; the incomplete tail stays for the
/// next chunk, because a network chunk can end inside a character.
fn take_utf8(pending: &mut Vec<u8>) -> String {
    let valid = match std::str::from_utf8(pending) {
        Ok(_) => pending.len(),
        Err(error) => error.valid_up_to(),
    };
    let text = String::from_utf8_lossy(&pending[..valid]).into_owned();
    pending.drain(..valid);
    text
}

async fn run(
    request: ModelRequest,
    on_chunk: Channel<String>,
    mut cancelled: watch::Receiver<bool>,
) -> Result<ModelResponse, String> {
    let url = url::Url::parse(request.url.trim()).map_err(|_| "Not a valid URL.".to_string())?;
    let may_carry_key = check_target(&request.provider, &url)?;

    let method = match request.method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        other => return Err(format!("Unsupported method {other}.")),
    };
    let mut builder = client().request(method, url);

    if may_carry_key {
        let key = provider_key(&request.provider)?.ok_or_else(|| {
            "This provider needs an API key. Add one in the runtime panel; it is kept in the OS keyring."
                .to_string()
        })?;
        for (name, value) in auth_headers(&request.api, &key) {
            builder = builder.header(name, value);
        }
    }
    for (name, value) in &request.headers {
        let lower = name.to_ascii_lowercase();
        if PASSTHROUGH_HEADERS.contains(&lower.as_str()) {
            builder = builder.header(lower, value);
        }
    }
    if let Some(body) = request.body {
        builder = builder.header("content-type", "application/json").body(body);
    }

    let response = tokio::select! {
        result = builder.send() => result.map_err(|error| describe(&error))?,
        _ = cancelled.changed() => return Err("Cancelled.".into()),
    };
    let status = response.status().as_u16();

    if !request.stream || !(200..300).contains(&status) {
        let body = tokio::select! {
            result = response.text() => result.map_err(|error| describe(&error))?,
            _ = cancelled.changed() => return Err("Cancelled.".into()),
        };
        return Ok(ModelResponse { status, body });
    }

    let mut stream = response.bytes_stream();
    let mut pending: Vec<u8> = Vec::new();
    loop {
        let next = tokio::select! {
            next = stream.next() => next,
            _ = cancelled.changed() => return Err("Cancelled.".into()),
        };
        match next {
            Some(Ok(bytes)) => {
                pending.extend_from_slice(&bytes);
                let text = take_utf8(&mut pending);
                if !text.is_empty() && on_chunk.send(text).is_err() {
                    // The web view went away; nobody is reading.
                    return Err("Cancelled.".into());
                }
            }
            Some(Err(error)) => return Err(describe(&error)),
            None => break,
        }
    }
    if !pending.is_empty() {
        let _ = on_chunk.send(String::from_utf8_lossy(&pending).into_owned());
    }
    Ok(ModelResponse { status, body: String::new() })
}

/// A plain sentence for the operator; reqwest's Display chains are long.
fn describe(error: &reqwest::Error) -> String {
    if error.is_connect() {
        "Could not connect to the runtime. Is it running, and is the address right?".into()
    } else if error.is_timeout() {
        "The runtime stopped responding.".into()
    } else {
        format!("Request failed: {error}")
    }
}

#[tauri::command]
pub async fn model_request(
    request: ModelRequest,
    on_chunk: Channel<String>,
) -> Result<ModelResponse, String> {
    let id = request.id.clone();
    let (sender, receiver) = watch::channel(false);
    inflight()
        .lock()
        .map_err(|_| "Request table poisoned.".to_string())?
        .insert(id.clone(), sender);
    let result = run(request, on_chunk, receiver).await;
    if let Ok(mut table) = inflight().lock() {
        table.remove(&id);
    }
    result
}

#[tauri::command]
pub fn model_cancel(id: String) {
    if let Ok(table) = inflight().lock() {
        if let Some(sender) = table.get(&id) {
            let _ = sender.send(true);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(provider: &str, raw: &str) -> Result<bool, String> {
        check_target(provider, &url::Url::parse(raw).unwrap())
    }

    #[test]
    fn a_pinned_key_only_goes_to_its_own_host() {
        assert_eq!(target("anthropic", "https://api.anthropic.com/v1/messages"), Ok(true));
        assert!(target("anthropic", "https://evil.example/v1/messages").is_err());
        assert!(target("openai", "https://api.anthropic.com/v1").is_err());
    }

    #[test]
    fn local_runtimes_never_carry_a_key() {
        assert_eq!(target("ollama", "http://localhost:11434/api/chat"), Ok(false));
        assert_eq!(target("lmstudio", "http://127.0.0.1:1234/v1/models"), Ok(false));
        // A local runtime pointed at a remote host still gets no key.
        assert_eq!(target("vllm", "https://gpu.example/v1/models"), Ok(false));
    }

    #[test]
    fn plaintext_is_refused_off_the_machine() {
        assert!(target("custom", "http://gateway.example/v1").is_err());
        assert!(target("ollama", "http://10.0.0.5:11434/api/tags").is_err());
        assert_eq!(target("custom", "https://gateway.example/v1"), Ok(true));
    }

    #[test]
    fn a_split_character_waits_for_the_next_chunk() {
        let mut pending = "é".as_bytes()[..1].to_vec();
        assert_eq!(take_utf8(&mut pending), "");
        pending.extend_from_slice(&"é".as_bytes()[1..]);
        assert_eq!(take_utf8(&mut pending), "é");
        assert!(pending.is_empty());
    }
}
