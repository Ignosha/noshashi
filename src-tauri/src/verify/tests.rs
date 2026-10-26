//! Verification tests.
//!
//! Fixture provenance, stated per test:
//!   REAL: entries from tests/fixtures/account-tx-solo-107587061.json,
//!         copied unmodified from mainnet account_tx (see that file's
//!         `source` field and tests/fixtures/README.md).
//!   SYNTHETIC: built by `synthetic()` below in the shape rippled's `tx`
//!         (API v2) returns. They exercise cases no recorded transaction
//!         covers (an XRP invoice, failures, missing fields). They are not
//!         ledger evidence and are never described as such.

use serde_json::{json, Value};

use super::amount::*;
use super::book::{Recorded, SettlementBook};
use super::evidence::{canonical_json, digest};
use super::model::*;
use super::rpc::{build_client, fetch_tx, iso_from_millis, Endpoint, Limits};
use super::verifier::*;

const NOW: &str = "2026-10-26T12:00:00.000Z";
const SRC: &str = "test-source";

fn real_entries() -> Vec<Value> {
    let raw = include_str!("../../../tests/fixtures/account-tx-solo-107587061.json");
    let v: Value = serde_json::from_str(raw).expect("fixture parses");
    v["transactions"].as_array().expect("transactions").clone()
}

/// REAL entry i as a source read.
fn real(i: usize) -> SourceRead {
    observe(SRC, NOW, &real_entries()[i])
}

fn real_hash(i: usize) -> String {
    real_entries()[i]["tx"]["hash"]
        .as_str()
        .unwrap()
        .to_string()
}

/// SYNTHETIC `tx` (API v2) result.
fn synthetic(
    hash: &str,
    amount: Value,
    delivered: Option<Value>,
    flags: u64,
    result: &str,
    validated: bool,
) -> Value {
    let mut meta = json!({ "TransactionResult": result, "AffectedNodes": [] });
    if let Some(d) = delivered {
        meta["delivered_amount"] = d;
    }
    json!({
        "hash": hash,
        "ledger_index": 99_000_000u64,
        "validated": validated,
        "tx_json": {
            "TransactionType": "Payment",
            "Account": "rSenderSyntheticxxxxxxxxxxxxxxxxx",
            "Destination": "rMerchantSyntheticxxxxxxxxxxxxxx",
            "DestinationTag": 42,
            "DeliverMax": amount,
            "Flags": flags,
        },
        "meta": meta,
    })
}

const H: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const MERCHANT: &str = "rMerchantSyntheticxxxxxxxxxxxxxx";

fn xrp_invoice(amount: &str) -> InvoicePolicy {
    InvoicePolicy {
        invoice_id: "INV-1".into(),
        destination: MERCHANT.into(),
        destination_tag: Some(42),
        asset: Asset::Xrp,
        expected_amount: Decimal::parse(amount).unwrap(),
        underpayment_tolerance: None,
        allow_partial_payment: false,
        hold_overpayment: false,
    }
}

fn run(hash: &str, reads: &[SourceRead], invoice: Option<&InvoicePolicy>) -> VerificationReport {
    run_with(hash, reads, invoice, None, RULES_VERSION)
}

fn run_with(
    hash: &str,
    reads: &[SourceRead],
    invoice: Option<&InvoicePolicy>,
    prior: Option<&str>,
    rules: &str,
) -> VerificationReport {
    verify(&VerifyInput {
        requested_hash: hash,
        network: Network::Mainnet,
        reads,
        invoice,
        prior_invoice: prior,
        evaluated_at: NOW,
        rules_version: rules,
    })
}

fn syn(v: Value) -> SourceRead {
    observe(SRC, NOW, &v)
}

// 1. Validated successful exact XRP payment (SYNTHETIC: no recorded XRP payment).
#[test]
fn t01_exact_xrp_payment_verifies() {
    let r = run(
        H,
        &[syn(synthetic(
            H,
            json!("25000000"),
            Some(json!("25000000")),
            0,
            "tesSUCCESS",
            true,
        ))],
        Some(&xrp_invoice("25")),
    );
    assert_eq!(r.status, Status::Verified);
    assert_eq!(r.reason_code, Reason::Settled);
    assert_eq!(r.amount_difference, Some(Decimal::zero()));
    assert_eq!(r.delivered_amount.unwrap().value.to_plain_string(), "25");
}

// 1b. REAL: a full (non-partial) issued-currency payment, facts only.
#[test]
fn t01b_real_full_payment_without_invoice_is_facts_only() {
    let r = run(&real_hash(0), &[real(0)], None);
    assert_eq!(r.status, Status::Hold);
    assert_eq!(r.reason_code, Reason::NoInvoicePolicy);
    assert_eq!(r.partial_payment, Some(false));
    assert_eq!(r.amount_mismatch, Some(false));
    assert_eq!(r.validated, Some(true));
}

// 2. REAL: partial payment that delivered less than it requested.
#[test]
fn t02_real_partial_payment_records_lower_delivered() {
    let r = run(&real_hash(2), &[real(2)], None);
    assert_eq!(r.partial_payment, Some(true));
    assert_eq!(r.amount_mismatch, Some(true));
    assert_eq!(
        r.requested_amount.as_ref().unwrap().value.to_plain_string(),
        "162.6994990013102"
    );
    assert_eq!(
        r.delivered_amount.as_ref().unwrap().value.to_plain_string(),
        "161.1605415577872"
    );
    assert!(r
        .findings
        .iter()
        .any(|f| f.code == Reason::PartialPaymentFlagged));
}

fn csc_invoice(expected: &str, allow_partial: bool) -> InvoicePolicy {
    InvoicePolicy {
        invoice_id: "INV-CSC".into(),
        destination: "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6".into(),
        destination_tag: None,
        asset: Asset::Issued {
            currency: "CSC".into(),
            issuer: "rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr".into(),
        },
        expected_amount: Decimal::parse(expected).unwrap(),
        underpayment_tolerance: None,
        allow_partial_payment: allow_partial,
        hold_overpayment: false,
    }
}

// 3. REAL partial payment, policy permits partials, delivered meets the invoice.
#[test]
fn t03_partial_permitted_and_sufficient() {
    let r = run(
        &real_hash(2),
        &[real(2)],
        Some(&csc_invoice("161.1605415577872", true)),
    );
    assert_eq!(r.status, Status::Verified);
    assert_eq!(r.reason_code, Reason::SettledPartialPermitted);
}

// 3b. Partial permitted but invoiced at the requested (larger) amount: underpaid.
#[test]
fn t03b_partial_permitted_but_short_is_underpaid() {
    let r = run(
        &real_hash(2),
        &[real(2)],
        Some(&csc_invoice("162.6994990013102", true)),
    );
    assert_eq!(r.status, Status::Rejected);
    assert_eq!(r.reason_code, Reason::Underpaid);
    assert_eq!(
        r.amount_difference.unwrap().to_plain_string(),
        "-1.538957443523"
    );
}

// 4. REAL partial payment, policy does not permit partials.
#[test]
fn t04_partial_not_permitted() {
    let r = run(&real_hash(2), &[real(2)], Some(&csc_invoice("161", false)));
    assert_eq!(r.status, Status::Rejected);
    assert_eq!(r.reason_code, Reason::PartialNotPermitted);
}

// 5. Unvalidated transaction (SYNTHETIC).
#[test]
fn t05_unvalidated_holds() {
    let r = run(
        H,
        &[syn(synthetic(
            H,
            json!("1000000"),
            Some(json!("1000000")),
            0,
            "tesSUCCESS",
            false,
        ))],
        Some(&xrp_invoice("1")),
    );
    assert_eq!(r.status, Status::Hold);
    assert_eq!(r.reason_code, Reason::NotValidated);
}

// 6. Missing metadata (SYNTHETIC).
#[test]
fn t06_missing_meta_holds() {
    let mut v = synthetic(
        H,
        json!("1000000"),
        Some(json!("1000000")),
        0,
        "tesSUCCESS",
        true,
    );
    v.as_object_mut().unwrap().remove("meta");
    let r = run(H, &[syn(v)], Some(&xrp_invoice("1")));
    assert_eq!(r.reason_code, Reason::MissingMetadata);
    assert_eq!(r.status, Status::Hold);
}

// 7. Missing delivered_amount: never fall back to the requested amount.
#[test]
fn t07_missing_delivered_never_uses_requested() {
    let r = run(
        H,
        &[syn(synthetic(
            H,
            json!("1000000"),
            None,
            0,
            "tesSUCCESS",
            true,
        ))],
        Some(&xrp_invoice("1")),
    );
    assert_eq!(r.reason_code, Reason::DeliveredMissing);
    assert_eq!(r.status, Status::Hold);
    assert!(r.delivered_amount.is_none());
}

// 8. delivered_amount "unavailable": unknown, not zero, not requested.
#[test]
fn t08_delivered_unavailable_holds() {
    let r = run(
        H,
        &[syn(synthetic(
            H,
            json!("1000000"),
            Some(json!("unavailable")),
            0,
            "tesSUCCESS",
            true,
        ))],
        Some(&xrp_invoice("1")),
    );
    assert_eq!(r.reason_code, Reason::DeliveredUnavailable);
    assert_eq!(r.status, Status::Hold);
    assert!(r.delivered_amount.is_none());
}

// 9. Invalid hash: rejected before anything is read.
#[test]
fn t09_invalid_hash() {
    for bad in ["", "abc", &"G".repeat(64), &"A".repeat(63), &"A".repeat(65)] {
        let r = run(bad, &[], None);
        assert_eq!(r.reason_code, Reason::InvalidHash, "{bad}");
        assert_eq!(r.status, Status::Rejected);
    }
    assert_eq!(
        normalize_hash(&format!(" {} ", H.to_lowercase())),
        Some(H.to_string())
    );
}

// 10. A source answering with a different transaction is never used.
#[test]
fn t10_hash_mismatch_holds() {
    let other = "B".repeat(64);
    let r = run(
        H,
        &[syn(synthetic(
            &other,
            json!("1000000"),
            Some(json!("1000000")),
            0,
            "tesSUCCESS",
            true,
        ))],
        Some(&xrp_invoice("1")),
    );
    assert_eq!(r.reason_code, Reason::HashMismatch);
    assert_eq!(r.status, Status::Hold);
}

// 11. Validated failed transaction (SYNTHETIC tecPATH_DRY).
#[test]
fn t11_validated_failure_rejects() {
    let r = run(
        H,
        &[syn(synthetic(
            H,
            json!("1000000"),
            None,
            0,
            "tecPATH_DRY",
            true,
        ))],
        Some(&xrp_invoice("1")),
    );
    assert_eq!(r.reason_code, Reason::TransactionFailed);
    assert_eq!(r.status, Status::Rejected);
    assert_eq!(r.transaction_result.as_deref(), Some("tecPATH_DRY"));
}

// 12. REAL: an OfferCancel is not a payment.
#[test]
fn t12_real_non_payment() {
    let r = run(&real_hash(4), &[real(4)], Some(&xrp_invoice("1")));
    assert_eq!(r.reason_code, Reason::NotPayment);
    assert_eq!(r.transaction_type.as_deref(), Some("OfferCancel"));
}

// 13. Same currency code, different issuer: a different asset.
#[test]
fn t13_different_issuer_is_different_asset() {
    let mut inv = csc_invoice("161", true);
    inv.asset = Asset::Issued {
        currency: "CSC".into(),
        issuer: "rSomeOtherIssuerxxxxxxxxxxxxxxxxx".into(),
    };
    let r = run(&real_hash(2), &[real(2)], Some(&inv));
    assert_eq!(r.reason_code, Reason::AssetMismatch);
    assert_eq!(r.status, Status::Rejected);
}

// 14. MPT amounts are not silently read as XRP (SYNTHETIC).
#[test]
fn t14_mpt_is_unsupported() {
    let mpt = json!({ "mpt_issuance_id": "0000012FFD9EE5DA93AC614B4DB94D7E0FCE415CA51BED47", "value": "100" });
    let r = run(
        H,
        &[syn(synthetic(
            H,
            mpt.clone(),
            Some(mpt),
            0,
            "tesSUCCESS",
            true,
        ))],
        Some(&xrp_invoice("1")),
    );
    assert_eq!(r.reason_code, Reason::UnsupportedAsset);
    assert_eq!(r.status, Status::Hold);
}

// 15. Zero amounts.
#[test]
fn t15_zero() {
    assert_eq!(
        run(H, &[], Some(&xrp_invoice("0"))).reason_code,
        Reason::InvalidPolicy
    );
    let r = run(
        H,
        &[syn(synthetic(
            H,
            json!("1000000"),
            Some(json!("0")),
            TF_PARTIAL_PAYMENT,
            "tesSUCCESS",
            true,
        ))],
        Some(&{
            let mut p = xrp_invoice("1");
            p.allow_partial_payment = true;
            p
        }),
    );
    assert_eq!(r.reason_code, Reason::Underpaid);
    assert!(Decimal::parse("0.000").unwrap().is_zero());
}

// 16. REAL precision edge: a SOLO partial short by 1.4687e-11.
#[test]
fn t16_real_precision_shortfall_is_detected() {
    let inv = InvoicePolicy {
        invoice_id: "INV-SOLO".into(),
        destination: "rogue5HnPRSszD9CWGSUz8UGHMVwSSKF6".into(),
        destination_tag: None,
        asset: Asset::Issued {
            currency: "534F4C4F00000000000000000000000000000000".into(),
            issuer: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz".into(),
        },
        expected_amount: Decimal::parse("1.064341457878901").unwrap(),
        underpayment_tolerance: None,
        allow_partial_payment: true,
        hold_overpayment: false,
    };
    let r = run(&real_hash(3), &[real(3)], Some(&inv));
    assert_eq!(r.reason_code, Reason::Underpaid);
    assert_eq!(
        r.amount_difference.unwrap().to_plain_string(),
        "-0.000000000014687"
    );
    // A tolerance at least that large accepts it.
    let mut lenient = inv.clone();
    lenient.underpayment_tolerance = Some(Decimal::parse("1e-10").unwrap());
    assert_eq!(
        run(&real_hash(3), &[real(3)], Some(&lenient)).reason_code,
        Reason::SettledPartialPermitted
    );
    // Lower-case hex currency in the invoice is the same asset.
    let mut lower = inv;
    lower.asset = Asset::Issued {
        currency: "534f4c4f00000000000000000000000000000000".into(),
        issuer: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz".into(),
    };
    assert_eq!(
        run(&real_hash(3), &[real(3)], Some(&lower)).reason_code,
        Reason::Underpaid
    );
}

#[test]
fn t16b_decimal_arithmetic_is_exact() {
    let a = Decimal::parse("0.1").unwrap();
    let b = Decimal::parse("0.2").unwrap();
    assert_eq!(a.add(&b), Decimal::parse("0.3").unwrap());
    assert_eq!(
        Decimal::parse("1e-1").unwrap(),
        Decimal::parse("0.10").unwrap()
    );
    assert_eq!(
        Decimal::parse("1.5e-7").unwrap().to_plain_string(),
        "0.00000015"
    );
    assert!(Decimal::parse("9.999999999999999e80").unwrap() > Decimal::parse("1e80").unwrap());
    assert_eq!(
        Decimal::from_drops_str("1").unwrap().to_plain_string(),
        "0.000001"
    );
    assert_eq!(
        Decimal::parse("0.0000001").unwrap().to_drops(),
        Err(AmountError::TooPrecise)
    );
    assert_eq!(Decimal::parse("2.5").unwrap().to_drops(), Ok(2_500_000));
    assert_eq!(
        Decimal::from_iou_str("1.2345678901234567"),
        Err(AmountError::TooPrecise)
    );
}

// 17. Large integer amounts: the full XRP supply in drops, exactly.
#[test]
fn t17_large_amounts() {
    let total = "100000000000000000";
    let r = run(
        H,
        &[syn(synthetic(
            H,
            json!(total),
            Some(json!(total)),
            0,
            "tesSUCCESS",
            true,
        ))],
        Some(&xrp_invoice("100000000000")),
    );
    assert_eq!(r.reason_code, Reason::Settled);
    assert_eq!(
        Decimal::from_drops_str("100000000000000001"),
        Err(AmountError::OutOfRange)
    );
    assert_eq!(
        Decimal::parse("99999999999").unwrap().to_drops(),
        Ok(99_999_999_999_000_000)
    );
}

// 18. Negative and malformed amounts.
#[test]
fn t18_negative_and_malformed() {
    for bad in [
        "-1",
        "1.2.3",
        "1e",
        "e5",
        "NaN",
        " 1",
        "1,000",
        "0x10",
        "1e9999999",
    ] {
        assert!(Decimal::from_iou_str(bad).is_err(), "{bad}");
    }
    assert_eq!(Decimal::from_drops_str("-5"), Err(AmountError::Negative));
    assert!(Decimal::from_drops_str("1.5").is_err());
    let r = run(
        H,
        &[syn(synthetic(
            H,
            json!("1000000"),
            Some(json!("-1000000")),
            0,
            "tesSUCCESS",
            true,
        ))],
        Some(&xrp_invoice("1")),
    );
    assert_eq!(r.reason_code, Reason::MalformedAmount);
    let neg = json!({ "currency": "USD", "issuer": "rX", "value": "-5" });
    assert!(matches!(
        parse_ledger_amount(&neg),
        ParsedAmount::Malformed(_)
    ));
    let mut p = xrp_invoice("1");
    p.underpayment_tolerance = Some(Decimal::parse("-1").unwrap());
    assert_eq!(run(H, &[], Some(&p)).reason_code, Reason::InvalidPolicy);
}

// 19. Missing TransactionResult.
#[test]
fn t19_missing_result_holds() {
    let mut v = synthetic(
        H,
        json!("1000000"),
        Some(json!("1000000")),
        0,
        "tesSUCCESS",
        true,
    );
    v["meta"]
        .as_object_mut()
        .unwrap()
        .remove("TransactionResult");
    let r = run(H, &[syn(v)], Some(&xrp_invoice("1")));
    assert_eq!(r.reason_code, Reason::MissingResult);
    assert_eq!(r.status, Status::Hold);
}

/// A one-shot local HTTP server returning `response` (or sleeping first).
async fn serve(response: String, delay_ms: u64) -> Endpoint {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        loop {
            let Ok((mut sock, _)) = listener.accept().await else {
                return;
            };
            let resp = response.clone();
            tokio::spawn(async move {
                let mut buf = [0u8; 4096];
                let _ = sock.read(&mut buf).await;
                tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                let _ = sock.write_all(resp.as_bytes()).await;
                let _ = sock.shutdown().await;
            });
        }
    });
    Endpoint {
        name: "local".into(),
        operator: "test".into(),
        url: format!("http://{addr}/"),
    }
}

fn http(status: &str, extra: &str, body: &str) -> String {
    format!("HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n{extra}\r\n{body}", body.len())
}

fn fast() -> Limits {
    Limits {
        connect_timeout: std::time::Duration::from_millis(500),
        request_timeout: std::time::Duration::from_millis(300),
        max_body_bytes: 64 * 1024,
        max_attempts: 2,
        base_backoff: std::time::Duration::from_millis(10),
        max_retry_after: std::time::Duration::from_millis(20),
    }
}

fn test_client() -> reqwest::Client {
    build_client(&fast())
}

// 20. Timeout.
#[tokio::test]
async fn t20_timeout_fails_closed() {
    let ep = serve(http("200 OK", "", "{}"), 2000).await;
    let (read, stats) = fetch_tx(&test_client(), &ep, H, &fast()).await;
    assert!(
        matches!(read, SourceRead::Failed { ref error, .. } if error.contains("timed out")),
        "{read:?}"
    );
    assert_eq!(stats.attempts, 2);
    assert_eq!(
        run(H, &[read], Some(&xrp_invoice("1"))).reason_code,
        Reason::SourceUnavailable
    );
}

// 21. HTTP error.
#[tokio::test]
async fn t21_http_error() {
    let ep = serve(http("403 Forbidden", "", "{}"), 0).await;
    let (read, stats) = fetch_tx(&test_client(), &ep, H, &fast()).await;
    assert!(
        matches!(read, SourceRead::Failed { ref error, .. } if error == "HTTP 403"),
        "{read:?}"
    );
    assert_eq!(stats.attempts, 1, "4xx is not retried");
}

// 22. Rate limiting: retried, then reported.
#[tokio::test]
async fn t22_rate_limited() {
    let ep = serve(http("429 Too Many Requests", "retry-after: 1\r\n", "{}"), 0).await;
    let (read, stats) = fetch_tx(&test_client(), &ep, H, &fast()).await;
    assert!(
        matches!(read, SourceRead::Failed { ref error, .. } if error.contains("429")),
        "{read:?}"
    );
    assert_eq!(stats.attempts, 2);
}

// 23. Oversized response: reading stops at the limit.
#[tokio::test]
async fn t23_oversized_response() {
    let big = format!("{{\"result\":{{\"pad\":\"{}\"}}}}", "x".repeat(200_000));
    let ep = serve(http("200 OK", "", &big), 0).await;
    let (read, _) = fetch_tx(&test_client(), &ep, H, &fast()).await;
    assert!(
        matches!(read, SourceRead::Failed { ref error, .. } if error.contains("limit")),
        "{read:?}"
    );
}

// 24. Malformed JSON.
#[tokio::test]
async fn t24_malformed_json() {
    let ep = serve(http("200 OK", "", "{not json"), 0).await;
    let (read, _) = fetch_tx(&test_client(), &ep, H, &fast()).await;
    assert!(
        matches!(read, SourceRead::Failed { ref error, .. } if error.contains("not valid JSON")),
        "{read:?}"
    );
}

// 24b. A well-formed reply is read end to end (SYNTHETIC payload, real HTTP).
#[tokio::test]
async fn t24b_good_response_end_to_end() {
    let body = json!({ "result": synthetic(H, json!("1000000"), Some(json!("1000000")), 0, "tesSUCCESS", true) }).to_string();
    let ep = serve(http("200 OK", "", &body), 0).await;
    let (read, _) = fetch_tx(&test_client(), &ep, H, &fast()).await;
    let r = run(H, &[read], Some(&xrp_invoice("1")));
    assert_eq!(r.reason_code, Reason::Settled);
}

// 24c. A compressed body is refused, not inflated.
#[tokio::test]
async fn t24c_compressed_refused() {
    let ep = serve(http("200 OK", "content-encoding: gzip\r\n", "{}"), 0).await;
    let (read, _) = fetch_tx(&test_client(), &ep, H, &fast()).await;
    assert!(
        matches!(read, SourceRead::Failed { ref error, .. } if error.contains("compressed")),
        "{read:?}"
    );
}

// 25. Two validated sources that disagree: hold, choose neither.
#[test]
fn t25_conflicting_sources() {
    let a = observe(
        "source-a",
        NOW,
        &synthetic(
            H,
            json!("1000000"),
            Some(json!("1000000")),
            0,
            "tesSUCCESS",
            true,
        ),
    );
    let b = observe(
        "source-b",
        NOW,
        &synthetic(
            H,
            json!("1000000"),
            Some(json!("10")),
            0,
            "tesSUCCESS",
            true,
        ),
    );
    let r = run(H, &[a, b], Some(&xrp_invoice("1")));
    assert_eq!(r.reason_code, Reason::SourceDisagreement);
    assert_eq!(r.status, Status::Hold);
}

// 26. A stale source (not yet validated, or not found) is lagging, not contradicting.
#[test]
fn t26_stale_source_is_not_a_conflict() {
    let fresh = observe(
        "fresh",
        NOW,
        &synthetic(
            H,
            json!("1000000"),
            Some(json!("1000000")),
            0,
            "tesSUCCESS",
            true,
        ),
    );
    let stale = observe(
        "stale",
        NOW,
        &synthetic(
            H,
            json!("1000000"),
            Some(json!("1000000")),
            0,
            "tesSUCCESS",
            false,
        ),
    );
    let missing = SourceRead::NotFound {
        source: "behind".into(),
        observed_at: NOW.into(),
    };
    let r = run(H, &[stale, fresh, missing], Some(&xrp_invoice("1")));
    assert_eq!(r.reason_code, Reason::Settled);
    assert!(r.findings.iter().any(|f| f.code == Reason::NotValidated));
    assert!(r.findings.iter().any(|f| f.code == Reason::NotFound));
    // Not found everywhere is HOLD, and distinct from failure.
    let nf = run(
        H,
        &[SourceRead::NotFound {
            source: "x".into(),
            observed_at: NOW.into(),
        }],
        None,
    );
    assert_eq!(nf.reason_code, Reason::NotFound);
}

// 27. Duplicate processing: one payment cannot settle two invoices.
#[test]
fn t27_duplicate_processing() {
    let mut book = SettlementBook::default();
    assert_eq!(book.record(H, "INV-1"), Ok(Recorded::New));
    assert_eq!(
        book.record(&H.to_lowercase(), "INV-1"),
        Ok(Recorded::AlreadyRecorded)
    );
    assert!(book.record(H, "INV-2").is_err());
    let read = syn(synthetic(
        H,
        json!("1000000"),
        Some(json!("1000000")),
        0,
        "tesSUCCESS",
        true,
    ));
    let mut second = xrp_invoice("1");
    second.invoice_id = "INV-2".into();
    let r = run_with(
        H,
        std::slice::from_ref(&read),
        Some(&second),
        book.prior_invoice(H),
        RULES_VERSION,
    );
    assert_eq!(r.reason_code, Reason::AlreadyApplied);
    assert_eq!(r.status, Status::Rejected);
    // Re-verifying against the invoice it already settled still verifies.
    let again = run_with(
        H,
        &[read],
        Some(&xrp_invoice("1")),
        book.prior_invoice(H),
        RULES_VERSION,
    );
    assert_eq!(again.reason_code, Reason::Settled);
}

// 28. Idempotent decisions: same inputs, same answer, same key, same digest.
#[test]
fn t28_idempotent() {
    let read = syn(synthetic(
        H,
        json!("1000000"),
        Some(json!("1000000")),
        0,
        "tesSUCCESS",
        true,
    ));
    let a = run(H, std::slice::from_ref(&read), Some(&xrp_invoice("1")));
    let b = run(H, &[read], Some(&xrp_invoice("1")));
    assert_eq!(a, b);
    assert_eq!(a.decision_key, b.decision_key);
}

// 29. Evidence digest reproducibility.
#[test]
fn t29_digest_reproducible() {
    let r = run(&real_hash(2), &[real(2)], Some(&csc_invoice("161", true)));
    assert_eq!(digest(&r.evidence), r.evidence_digest);
    // Independent of key order.
    let shuffled: Value = serde_json::from_str(&canonical_json(&r.evidence)).unwrap();
    assert_eq!(digest(&shuffled), r.evidence_digest);
    let a = json!({ "b": 1, "a": { "y": [1, 2], "x": "s" } });
    let b = json!({ "a": { "x": "s", "y": [1, 2] }, "b": 1 });
    assert_eq!(canonical_json(&a), canonical_json(&b));
    assert_eq!(canonical_json(&a), r#"{"a":{"x":"s","y":[1,2]},"b":1}"#);
    // Any change to the evidence changes the digest.
    let mut tampered = r.evidence.clone();
    tampered["derived"]["reason_code"] = json!("SETTLED");
    assert_ne!(digest(&tampered), r.evidence_digest);
}

// 30. A rules-version change shows in the digest and the decision key.
#[test]
fn t30_rule_version_changes_digest() {
    let read = syn(synthetic(
        H,
        json!("1000000"),
        Some(json!("1000000")),
        0,
        "tesSUCCESS",
        true,
    ));
    let a = run_with(
        H,
        std::slice::from_ref(&read),
        Some(&xrp_invoice("1")),
        None,
        RULES_VERSION,
    );
    let b = run_with(H, &[read], Some(&xrp_invoice("1")), None, "xrpl-payment/2");
    assert_ne!(a.evidence_digest, b.evidence_digest);
    assert_ne!(a.decision_key, b.decision_key);
    assert_eq!(b.rule_version, "xrpl-payment/2");
}

// Policy: destination, destination tag, overpayment review.
#[test]
fn t31_destination_tag_and_overpayment() {
    let read = syn(synthetic(
        H,
        json!("2000000"),
        Some(json!("2000000")),
        0,
        "tesSUCCESS",
        true,
    ));
    let mut wrong_dest = xrp_invoice("2");
    wrong_dest.destination = "rElsewherexxxxxxxxxxxxxxxxxxxxxxx".into();
    assert_eq!(
        run(H, std::slice::from_ref(&read), Some(&wrong_dest)).reason_code,
        Reason::DestinationMismatch
    );
    let mut wrong_tag = xrp_invoice("2");
    wrong_tag.destination_tag = Some(7);
    assert_eq!(
        run(H, std::slice::from_ref(&read), Some(&wrong_tag)).reason_code,
        Reason::DestinationTagMismatch
    );
    let mut review = xrp_invoice("1.5");
    review.hold_overpayment = true;
    assert_eq!(
        run(H, std::slice::from_ref(&read), Some(&review)).reason_code,
        Reason::OverpaidReview
    );
    let over = run(H, &[read], Some(&xrp_invoice("1.5")));
    assert_eq!(over.reason_code, Reason::Settled);
    assert_eq!(over.amount_difference.unwrap().to_plain_string(), "0.5");
}

// The JSON contract: status and reason codes as stable strings, money as strings.
#[test]
fn t32_output_contract() {
    let r = run(
        H,
        &[syn(synthetic(
            H,
            json!("1500000"),
            Some(json!("1500000")),
            0,
            "tesSUCCESS",
            true,
        ))],
        Some(&xrp_invoice("1.5")),
    );
    let v = serde_json::to_value(&r).unwrap();
    assert_eq!(v["status"], "VERIFIED");
    assert_eq!(v["reason_code"], "SETTLED");
    assert_eq!(v["delivered_amount"]["value"], "1.5");
    assert_eq!(v["delivered_amount"]["asset"]["kind"], "xrp");
    let held = serde_json::to_value(run(H, &[], None)).unwrap();
    assert_eq!(
        held["ledger_index"],
        Value::Null,
        "unknown stays null, never a default"
    );
}

#[test]
fn t33_iso_clock() {
    assert_eq!(iso_from_millis(0), "1970-01-01T00:00:00.000Z");
    assert_eq!(
        iso_from_millis(1_792_934_701_283),
        "2026-10-25T13:25:01.283Z"
    );
    assert_eq!(iso_from_millis(951_782_400_000), "2000-02-29T00:00:00.000Z");
}

/// Property-style check without a new dependency: a deterministic sweep of
/// pseudo-random integers and scales, compared against i128 arithmetic.
#[test]
fn t34_decimal_properties() {
    let mut seed: u64 = 0x9E37_79B9_7F4A_7C15;
    let mut next = || {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed
    };
    for _ in 0..5000 {
        let a = (next() % 1_000_000_000_000) as i128 - 500_000_000_000;
        let b = (next() % 1_000_000_000_000) as i128 - 500_000_000_000;
        let scale = (next() % 12) as i64;
        let da = Decimal::parse(&format!("{a}e-{scale}")).unwrap();
        let db = Decimal::parse(&format!("{b}e-{scale}")).unwrap();
        assert_eq!(da.cmp(&db), a.cmp(&b), "{a} vs {b}");
        assert_eq!(
            da.add(&db),
            Decimal::parse(&format!("{}e-{scale}", a + b)).unwrap()
        );
        assert_eq!(
            da.sub(&db),
            Decimal::parse(&format!("{}e-{scale}", a - b)).unwrap()
        );
        // Round trip through plain notation.
        assert_eq!(Decimal::parse(&da.to_plain_string()).unwrap(), da);
    }
}

/// LIVE, against XRPL mainnet: the REAL CSC partial payment, read from two
/// endpoints run by different operators. Ignored by default (it needs the
/// network); CI runs it with `cargo test --lib verify -- --ignored`.
#[tokio::test]
#[ignore]
async fn live_mainnet_partial_payment_two_operators() {
    let hash = real_hash(2);
    let resp = super::run(
        super::VerifyRequest {
            hash: hash.clone(),
            network: Network::Mainnet,
            invoice: Some(csc_invoice("161.1605415577872", false)),
            dual_source: true,
            record: false,
        },
        &Limits::default(),
    )
    .await;
    let r = &resp.report;
    eprintln!("sources: {:?}", resp.source_stats);
    eprintln!("findings: {:?}", r.findings);
    assert_eq!(r.transaction_hash, hash);
    assert_eq!(r.sources.len(), 2, "two independent operators were asked");
    assert_eq!(r.validated, Some(true));
    assert_eq!(r.ledger_index, Some(107_587_014));
    assert_eq!(r.partial_payment, Some(true));
    assert_eq!(
        r.delivered_amount.as_ref().unwrap().value.to_plain_string(),
        "161.1605415577872"
    );
    assert_eq!(r.reason_code, Reason::PartialNotPermitted);
    assert_eq!(r.status, Status::Rejected);
}

/// Cross-language parity: src/lib/desk/__tests__/verifyPayment.test.ts
/// hashes the same record with the TypeScript canonicalizer and expects
/// this same digest, so an exported record can be checked without the app.
#[test]
fn t35_digest_parity_vector() {
    let record = json!({
        "schema": "noshashi.xrpl-payment-evidence/1",
        "b": [1, true, null, "Zürich \"quoted\" \n"],
        "a": { "z": "161.1605415577872", "y": 107587014u64 },
    });
    assert_eq!(digest(&record), PARITY_DIGEST);
}

const PARITY_DIGEST: &str = "ACA86C389009899CF9FCCC15EA4E175A57571075388F5EEB4FFC98E5767A2766";

/// Shared with the hosted API (supabase/functions/noshashi-verify/payment.ts):
/// both sides run tests/fixtures/payment-verify-vectors.json and must reach
/// the same status, reason, findings, decision key and evidence digest.
/// With NOSHASHI_WRITE_VECTORS=1 this engine writes `expected` instead.
#[test]
fn t36_shared_vectors() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/payment-verify-vectors.json"
    );
    let mut file: Value = serde_json::from_str(&std::fs::read_to_string(path).expect("vectors"))
        .expect("vectors parse");
    let entries = real_entries();
    let write = std::env::var("NOSHASHI_WRITE_VECTORS").is_ok();
    let vectors = file["vectors"].as_array_mut().expect("vectors array");
    assert!(vectors.len() >= 30);
    for v in vectors.iter_mut() {
        let name = v["name"].as_str().unwrap().to_string();
        let reads: Vec<SourceRead> = v["reads"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| {
                let source = r["source"].as_str().unwrap();
                let at = r["observed_at"].as_str().unwrap();
                if let Some(i) = r["fixture"].as_u64() {
                    observe(source, at, &entries[i as usize])
                } else if let Some(e) = r["failed"].as_str() {
                    SourceRead::Failed {
                        source: source.into(),
                        observed_at: at.into(),
                        error: e.into(),
                    }
                } else {
                    observe(source, at, &r["result"])
                }
            })
            .collect();
        let invoice: Option<InvoicePolicy> = if v["invoice"].is_null() {
            None
        } else {
            Some(serde_json::from_value(v["invoice"].clone()).expect("invoice"))
        };
        let network: Network = serde_json::from_value(v["network"].clone()).unwrap();
        let report = verify(&VerifyInput {
            requested_hash: v["hash"].as_str().unwrap(),
            network,
            reads: &reads,
            invoice: invoice.as_ref(),
            prior_invoice: v["prior_invoice"].as_str(),
            evaluated_at: v["evaluated_at"].as_str().unwrap(),
            rules_version: RULES_VERSION,
        });
        let got = json!({
            "status": report.status,
            "reason_code": report.reason_code,
            "findings": report.findings.iter().map(|f| f.code).collect::<Vec<_>>(),
            "amount_difference": report.amount_difference,
            "decision_key": report.decision_key,
            "evidence_digest": report.evidence_digest,
        });
        if write {
            v["expected"] = got;
        } else {
            assert_eq!(v["expected"], got, "vector: {name}");
        }
    }
    if write {
        let mut text = serde_json::to_string_pretty(&file).unwrap();
        text.push('\n');
        std::fs::write(path, text).unwrap();
    }
}
