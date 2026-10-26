//! XRPL payment verification: did this transaction really pay this invoice?
//!
//!   amount    exact decimals and asset identity; no floating point
//!   model     the contract: statuses, reason codes, invoice policy, report
//!   verifier  the deterministic checks (no I/O, no clock)
//!   evidence  canonical JSON and its SHA-256 digest
//!   rpc       bounded, allowlisted reads from XRPL nodes
//!   book      which transaction already settled which invoice
//!
//! The command below is the only way in from the web view. It takes a hash,
//! a network name and an optional invoice; it never takes a URL, never
//! signs anything and never touches a key. docs/VERIFICATION_ENGINE.md
//! describes the contract.

pub mod amount;
pub mod book;
pub mod evidence;
pub mod model;
pub mod rpc;
pub mod verifier;

#[cfg(test)]
mod tests;

use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;

use book::SettlementBook;
use model::{InvoicePolicy, Network, Status, VerificationReport, RULES_VERSION};
use rpc::{FetchStats, Limits};
use verifier::{normalize_hash, verify, SourceRead, VerifyInput};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRequest {
    pub hash: String,
    pub network: Network,
    #[serde(default)]
    pub invoice: Option<InvoicePolicy>,
    /// Read from two endpoints run by different operators and compare.
    #[serde(default)]
    pub dual_source: bool,
    /// Remember a VERIFIED settlement so the same transaction cannot settle
    /// a second invoice in this session.
    #[serde(default)]
    pub record: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResponse {
    pub report: VerificationReport,
    pub source_stats: Vec<FetchStats>,
    /// Whether the settlement was recorded in this session's book.
    pub recorded: bool,
}

fn book() -> &'static Mutex<SettlementBook> {
    static BOOK: OnceLock<Mutex<SettlementBook>> = OnceLock::new();
    BOOK.get_or_init(|| Mutex::new(SettlementBook::default()))
}

/// At most four verifications in flight; the rest wait their turn.
fn permits() -> &'static Semaphore {
    static SEM: OnceLock<Semaphore> = OnceLock::new();
    SEM.get_or_init(|| Semaphore::new(4))
}

/// Read the transaction from allowlisted sources and verify it.
pub async fn run(request: VerifyRequest, limits: &Limits) -> VerifyResponse {
    let now = rpc::now_iso();
    let mut stats = vec![];
    let mut reads: Vec<SourceRead> = vec![];

    if let Some(hash) = normalize_hash(&request.hash) {
        let _permit = permits().acquire().await.ok();
        let client = rpc::client();
        if request.dual_source {
            let eps = rpc::independent(request.network, 2);
            for (read, s) in rpc::fetch_all(client, &eps, &hash, limits).await {
                reads.push(read);
                stats.push(s);
            }
        } else {
            // One source; fall back to the next endpoint only if it gave no answer.
            for ep in rpc::endpoints(request.network) {
                let (read, s) = rpc::fetch_tx(client, &ep, &hash, limits).await;
                let failed = matches!(read, SourceRead::Failed { .. });
                reads.push(read);
                stats.push(s);
                if !failed {
                    break;
                }
            }
        }
    }

    let prior = book().lock().ok().and_then(|b| {
        b.prior_invoice(&request.hash.trim().to_ascii_uppercase())
            .map(str::to_string)
    });
    let report = verify(&VerifyInput {
        requested_hash: &request.hash,
        network: request.network,
        reads: &reads,
        invoice: request.invoice.as_ref(),
        prior_invoice: prior.as_deref(),
        evaluated_at: &now,
        rules_version: RULES_VERSION,
    });

    let mut recorded = false;
    if request.record && report.status == Status::Verified {
        if let (Some(id), Ok(mut b)) = (report.invoice_id.as_deref(), book().lock()) {
            recorded = b.record(&report.transaction_hash, id).is_ok();
        }
    }
    VerifyResponse {
        report,
        source_stats: stats,
        recorded,
    }
}

#[tauri::command]
pub async fn verify_xrpl_payment(request: VerifyRequest) -> Result<VerifyResponse, String> {
    Ok(run(request, &Limits::default()).await)
}
