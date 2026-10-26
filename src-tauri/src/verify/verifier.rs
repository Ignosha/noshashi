//! The deterministic part: raw source responses and an invoice in, a
//! status, reasons and evidence out. No I/O, no clock: the caller passes
//! the evaluation time, so the same inputs always give the same report.

use serde_json::{json, Value};

use super::amount::{parse_ledger_amount, Amount, Asset, Decimal, ParsedAmount};
use super::evidence::{canonical_json, digest, hex_sha256};
use super::model::*;

/// tfPartialPayment.
pub const TF_PARTIAL_PAYMENT: u64 = 0x0002_0000;

/// A transaction hash is exactly 64 hex characters. Normalised to upper
/// case, which is how rippled prints it.
pub fn normalize_hash(input: &str) -> Option<String> {
    let h = input.trim();
    if h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit()) {
        Some(h.to_ascii_uppercase())
    } else {
        None
    }
}

/// What one source said about the transaction.
// At most three per verification, so the size gap between variants costs
// nothing worth a Box.
#[allow(clippy::large_enum_variant)]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SourceRead {
    Observed(Observation),
    /// The source answered and does not have it (`txnNotFound`).
    NotFound {
        source: String,
        observed_at: String,
    },
    /// No usable answer: timeout, HTTP error, rate limit, oversized or
    /// malformed response. The text says which.
    Failed {
        source: String,
        observed_at: String,
        error: String,
    },
}

impl SourceRead {
    pub fn source(&self) -> &str {
        match self {
            SourceRead::Observed(o) => &o.source,
            SourceRead::NotFound { source, .. } | SourceRead::Failed { source, .. } => source,
        }
    }
}

/// Turn a rippled `tx` result (API v1 or v2) or an `account_tx` entry into
/// an observation. Fields the response lacks stay `None`.
pub fn observe(source: &str, observed_at: &str, result: &Value) -> SourceRead {
    if let Some(err) = result.get("error").and_then(Value::as_str) {
        if err == "txnNotFound" {
            return SourceRead::NotFound {
                source: source.into(),
                observed_at: observed_at.into(),
            };
        }
        return SourceRead::Failed {
            source: source.into(),
            observed_at: observed_at.into(),
            error: format!("node error: {err}"),
        };
    }
    if !result.is_object() {
        return SourceRead::Failed {
            source: source.into(),
            observed_at: observed_at.into(),
            error: "result is not a JSON object".into(),
        };
    }
    // API v2 nests the transaction in tx_json, account_tx uses `tx`, API v1
    // puts its fields at the top level.
    let tx = result
        .get("tx_json")
        .or_else(|| result.get("tx"))
        .unwrap_or(result);
    let meta = result
        .get("meta")
        .or_else(|| result.get("metaData"))
        .filter(|m| m.is_object());
    let s = |v: Option<&Value>| v.and_then(Value::as_str).map(str::to_string);
    let returned_hash = s(result.get("hash")).or_else(|| s(tx.get("hash")));
    let ledger_index = result
        .get("ledger_index")
        .or_else(|| tx.get("ledger_index"))
        .and_then(Value::as_u64);
    SourceRead::Observed(Observation {
        source: source.into(),
        observed_at: observed_at.into(),
        returned_hash,
        validated: result.get("validated").and_then(Value::as_bool),
        ledger_index,
        transaction_type: s(tx.get("TransactionType")),
        transaction_result: meta.and_then(|m| s(m.get("TransactionResult"))),
        account: s(tx.get("Account")),
        destination: s(tx.get("Destination")),
        destination_tag: tx
            .get("DestinationTag")
            .and_then(Value::as_u64)
            .and_then(|t| u32::try_from(t).ok()),
        flags: tx.get("Flags").and_then(Value::as_u64),
        requested_raw: tx.get("DeliverMax").or_else(|| tx.get("Amount")).cloned(),
        delivered_raw: meta.and_then(|m| {
            m.get("delivered_amount")
                .or_else(|| m.get("DeliveredAmount"))
                .cloned()
        }),
        has_meta: meta.is_some(),
    })
}

/// The fields two validated observations of one transaction must agree on.
fn fingerprint(o: &Observation) -> Value {
    json!({
        "hash": o.returned_hash.as_ref().map(|h| h.to_ascii_uppercase()),
        "ledger_index": o.ledger_index,
        "type": o.transaction_type,
        "result": o.transaction_result,
        "account": o.account,
        "destination": o.destination,
        "destination_tag": o.destination_tag,
        "flags": o.flags,
        "requested": o.requested_raw,
        "delivered": o.delivered_raw,
    })
}

struct Decision {
    reason: Reason,
    findings: Vec<Finding>,
    primary: Option<Observation>,
    requested: Option<Amount>,
    delivered: Option<Amount>,
    partial: Option<bool>,
    difference: Option<Decimal>,
}

fn finding(code: Reason, explanation: impl Into<String>) -> Finding {
    Finding {
        code,
        explanation: explanation.into(),
    }
}

impl Decision {
    fn stop(mut self, code: Reason, why: impl Into<String>) -> Self {
        self.reason = code;
        self.findings.insert(0, finding(code, why));
        self
    }
}

fn amount_text(a: &Amount) -> String {
    match &a.asset {
        Asset::Xrp => format!("{} XRP", a.value),
        Asset::Issued { currency, issuer } => {
            format!("{} {} (issuer {})", a.value, currency, issuer)
        }
    }
}

/// Validate the invoice itself before using it.
fn policy_problem(p: &InvoicePolicy) -> Option<String> {
    if p.invoice_id.trim().is_empty() {
        return Some("The invoice has no identifier.".into());
    }
    if p.destination.trim().is_empty() {
        return Some("The invoice names no receiving account.".into());
    }
    if p.expected_amount.is_negative() || p.expected_amount.is_zero() {
        return Some("The expected amount must be greater than zero.".into());
    }
    if let Some(t) = &p.underpayment_tolerance {
        if t.is_negative() {
            return Some("The underpayment tolerance cannot be negative.".into());
        }
        if t >= &p.expected_amount {
            return Some(
                "The underpayment tolerance must be smaller than the expected amount.".into(),
            );
        }
    }
    if p.asset == Asset::Xrp && p.expected_amount.to_drops().is_err() {
        return Some("An XRP amount cannot be finer than one drop (0.000001 XRP).".into());
    }
    None
}

fn decide(
    requested_hash: &str,
    reads: &[SourceRead],
    invoice: Option<&InvoicePolicy>,
    prior_invoice: Option<&str>,
) -> Decision {
    let mut d = Decision {
        reason: Reason::Settled,
        findings: vec![],
        primary: None,
        requested: None,
        delivered: None,
        partial: None,
        difference: None,
    };

    let Some(hash) = normalize_hash(requested_hash) else {
        return d.stop(
            Reason::InvalidHash,
            "A transaction hash is exactly 64 hexadecimal characters. Nothing was looked up.",
        );
    };

    if let Some(p) = invoice {
        if let Some(problem) = policy_problem(p) {
            return d.stop(Reason::InvalidPolicy, problem);
        }
    }

    let observed: Vec<&Observation> = reads
        .iter()
        .filter_map(|r| {
            if let SourceRead::Observed(o) = r {
                Some(o)
            } else {
                None
            }
        })
        .collect();

    for r in reads {
        if let SourceRead::Failed { source, error, .. } = r {
            d.findings.push(finding(
                Reason::SourceUnavailable,
                format!("{source} gave no usable answer: {error}."),
            ));
        }
    }

    if observed.is_empty() {
        let not_found = reads
            .iter()
            .any(|r| matches!(r, SourceRead::NotFound { .. }));
        let failed = reads.iter().any(|r| matches!(r, SourceRead::Failed { .. }));
        return if not_found && !failed {
            d.stop(
                Reason::NotFound,
                "No source has this transaction. It may not exist, may not have reached these nodes yet, or may be older than their history. Not found is not the same as failed.",
            )
        } else {
            d.stop(
                Reason::SourceUnavailable,
                "No source returned a usable answer, so nothing about this transaction is known.",
            )
        };
    }

    // Never let a response about another transaction stand in for this one.
    for o in &observed {
        match &o.returned_hash {
            None => {
                return d.stop(Reason::MalformedResponse, format!("{} returned a transaction without a hash, so it cannot be tied to the one requested.", o.source));
            }
            Some(h) if !h.eq_ignore_ascii_case(&hash) => {
                return d.stop(Reason::HashMismatch, format!("{} answered with transaction {h}, not the one requested. Its answer is not used.", o.source));
            }
            _ => {}
        }
    }

    let validated: Vec<&Observation> = observed
        .iter()
        .copied()
        .filter(|o| o.validated == Some(true))
        .collect();
    let Some(first) = validated.first().copied() else {
        let o = observed[0];
        d.primary = Some(o.clone());
        let why = if o.validated.is_none() {
            "The source did not say whether this transaction is in a validated ledger. Until that is known it is treated as not final."
        } else {
            "The transaction is not in a validated ledger yet. It can still fail or disappear; nothing is final."
        };
        return d.stop(Reason::NotValidated, why);
    };

    // Compare every validated observation with the first. A source that has
    // not seen it yet is lagging, not contradicting.
    for other in validated.iter().skip(1) {
        if fingerprint(other) != fingerprint(first) {
            d.primary = Some(first.clone());
            return d.stop(
                Reason::SourceDisagreement,
                format!(
                    "{} and {} both report this transaction as validated but disagree on its contents. Neither answer is chosen; a person should review both.",
                    first.source, other.source
                ),
            );
        }
    }
    for o in observed.iter().filter(|o| o.validated != Some(true)) {
        d.findings.push(finding(Reason::NotValidated, format!("{} has not yet seen this transaction as validated; it is lagging, not contradicting.", o.source)));
    }
    for r in reads {
        if let SourceRead::NotFound { source, .. } = r {
            d.findings.push(finding(
                Reason::NotFound,
                format!("{source} does not have this transaction yet; treated as lagging."),
            ));
        }
    }
    let o = first.clone();
    d.primary = Some(o.clone());

    if !o.has_meta {
        return d.stop(Reason::MissingMetadata, "The validated transaction came back without its metadata, which is where the delivered amount and the result live.");
    }
    let Some(result) = o.transaction_result.clone() else {
        return d.stop(Reason::MissingResult, "The metadata has no TransactionResult, so whether the transaction succeeded is unknown.");
    };
    if result != "tesSUCCESS" {
        return d.stop(
            Reason::TransactionFailed,
            format!("The transaction is validated with result {result}. It delivered nothing; only its fee was spent. This is a final failure, not a pending payment."),
        );
    }
    match o.transaction_type.as_deref() {
        Some("Payment") => {}
        Some(other) => {
            return d.stop(Reason::NotPayment, format!("This is a {other}, not a Payment. It does not deliver a payment amount, so it cannot settle an invoice."));
        }
        None => {
            return d.stop(
                Reason::MalformedResponse,
                "The transaction has no TransactionType.",
            )
        }
    }

    let partial = o.flags.map(|f| f & TF_PARTIAL_PAYMENT != 0);
    d.partial = partial;

    match o.requested_raw.as_ref().map(parse_ledger_amount) {
        Some(ParsedAmount::Known(a)) => d.requested = Some(a),
        Some(ParsedAmount::Unsupported(what)) => {
            return d.stop(
                Reason::UnsupportedAsset,
                format!("The requested amount is a {what}, which this engine does not read yet."),
            )
        }
        Some(ParsedAmount::Malformed(why)) => {
            return d.stop(
                Reason::MalformedAmount,
                format!("The requested amount could not be read: {why}."),
            )
        }
        None => {
            return d.stop(
                Reason::MalformedResponse,
                "The payment has neither Amount nor DeliverMax.",
            )
        }
    }

    match o.delivered_raw.as_ref() {
        None => {
            return d.stop(Reason::DeliveredMissing, "The metadata carries no delivered_amount. The requested amount is not evidence of what arrived, so nothing is credited.");
        }
        Some(Value::String(s)) if s == "unavailable" => {
            return d.stop(
                Reason::DeliveredUnavailable,
                "The ledger reports delivered_amount as \"unavailable\": this payment predates the field. What arrived is unknown, not zero, and not the requested amount. Reconstruct it from the balance changes before crediting.",
            );
        }
        Some(raw) => match parse_ledger_amount(raw) {
            ParsedAmount::Known(a) => d.delivered = Some(a),
            ParsedAmount::Unsupported(what) => {
                return d.stop(
                    Reason::UnsupportedAsset,
                    format!(
                        "The delivered amount is a {what}, which this engine does not read yet."
                    ),
                )
            }
            ParsedAmount::Malformed(why) => {
                return d.stop(
                    Reason::MalformedAmount,
                    format!("The delivered amount could not be read: {why}."),
                )
            }
        },
    }
    let delivered = d.delivered.clone().unwrap_or_else(|| Amount {
        asset: Asset::Xrp,
        value: Decimal::zero(),
    });
    let requested = d.requested.clone().unwrap_or_else(|| delivered.clone());

    if partial == Some(true) {
        let note = if requested.asset.same_as(&delivered.asset) && requested.value > delivered.value
        {
            format!(
                "Flagged tfPartialPayment: it asked to deliver {} and delivered {}. Credit only what was delivered.",
                amount_text(&requested),
                amount_text(&delivered)
            )
        } else {
            format!("Flagged tfPartialPayment: it delivered {}. The flag allowed less; this time it was not less.", amount_text(&delivered))
        };
        d.findings
            .push(finding(Reason::PartialPaymentFlagged, note));
    }

    let Some(p) = invoice else {
        return d.stop(
            Reason::NoInvoicePolicy,
            format!(
                "The payment is validated and delivered {}. No invoice was supplied, so these are the transaction's facts only: nothing is marked as settled.",
                amount_text(&delivered)
            ),
        );
    };

    if let Some(prev) = prior_invoice {
        if prev != p.invoice_id {
            return d.stop(Reason::AlreadyApplied, format!("This transaction was already applied to invoice {prev}. One payment cannot settle two invoices."));
        }
    }
    if o.destination.as_deref() != Some(p.destination.as_str()) {
        return d.stop(
            Reason::DestinationMismatch,
            format!(
                "The payment went to {}, not to the invoice's account {}.",
                o.destination.as_deref().unwrap_or("an unrecorded account"),
                p.destination
            ),
        );
    }
    if let Some(tag) = p.destination_tag {
        if o.destination_tag != Some(tag) {
            let got = o
                .destination_tag
                .map(|t| t.to_string())
                .unwrap_or_else(|| "no tag".into());
            return d.stop(
                Reason::DestinationTagMismatch,
                format!("The invoice requires destination tag {tag}; the payment carries {got}."),
            );
        }
    }
    if !delivered.asset.same_as(&p.asset) {
        return d.stop(
            Reason::AssetMismatch,
            "The payment delivered a different asset from the one invoiced. The same currency code from a different issuer is a different asset.",
        );
    }

    let difference = delivered.value.sub(&p.expected_amount);
    d.difference = Some(difference.clone());
    let tolerance = p
        .underpayment_tolerance
        .clone()
        .unwrap_or_else(Decimal::zero);
    let short = difference < tolerance.negated();

    if partial == Some(true) && !p.allow_partial_payment {
        return d.stop(
            Reason::PartialNotPermitted,
            "The payment is flagged tfPartialPayment and this invoice does not accept partial payments. Its success code does not mean the invoice was paid in full.",
        );
    }
    if short {
        return d.stop(
            Reason::Underpaid,
            format!(
                "Delivered {}, short of the invoiced {} by {}.",
                amount_text(&delivered),
                p.expected_amount,
                difference.negated()
            ),
        );
    }
    if difference > Decimal::zero() && p.hold_overpayment {
        return d.stop(
            Reason::OverpaidReview,
            format!(
                "Delivered {} more than invoiced; this invoice holds overpayments for review.",
                difference
            ),
        );
    }
    if partial == Some(true) {
        d.stop(Reason::SettledPartialPermitted, "Partial payment accepted by this invoice's policy: what it delivered meets the invoice.")
    } else {
        d.stop(
            Reason::Settled,
            format!(
                "Validated, succeeded, not partial, delivered {} to the invoiced account.",
                amount_text(&delivered)
            ),
        )
    }
}

/// Inputs to one verification.
pub struct VerifyInput<'a> {
    pub requested_hash: &'a str,
    pub network: Network,
    pub reads: &'a [SourceRead],
    pub invoice: Option<&'a InvoicePolicy>,
    /// The invoice this transaction was already applied to, if any.
    pub prior_invoice: Option<&'a str>,
    pub evaluated_at: &'a str,
    pub rules_version: &'a str,
}

fn observation_record(r: &SourceRead) -> Value {
    match r {
        SourceRead::Observed(o) => json!({
            "status": "observed",
            "source": o.source,
            "observed_at": o.observed_at,
            "returned_hash": o.returned_hash,
            "validated": o.validated,
            "ledger_index": o.ledger_index,
            "transaction_type": o.transaction_type,
            "transaction_result": o.transaction_result,
            "account": o.account,
            "destination": o.destination,
            "destination_tag": o.destination_tag,
            "flags": o.flags,
            "requested_raw": o.requested_raw,
            "delivered_raw": o.delivered_raw,
            "has_meta": o.has_meta,
        }),
        SourceRead::NotFound {
            source,
            observed_at,
        } => json!({"status": "not_found", "source": source, "observed_at": observed_at}),
        SourceRead::Failed {
            source,
            observed_at,
            error,
        } => {
            json!({"status": "failed", "source": source, "observed_at": observed_at, "error": error})
        }
    }
}

/// Run the checks and build the report with its evidence and digest.
pub fn verify(input: &VerifyInput) -> VerificationReport {
    let d = decide(
        input.requested_hash,
        input.reads,
        input.invoice,
        input.prior_invoice,
    );
    let status = d.reason.status();
    let hash = normalize_hash(input.requested_hash)
        .unwrap_or_else(|| input.requested_hash.trim().to_string());
    let primary = d.primary.as_ref();
    let amount_mismatch = match (&d.requested, &d.delivered) {
        (Some(r), Some(dl)) => Some(!(r.asset.same_as(&dl.asset) && r.value == dl.value)),
        _ => None,
    };
    let invoice_value = input
        .invoice
        .map(|p| serde_json::to_value(p).unwrap_or(Value::Null));
    let decision_key = hex_sha256(
        canonical_json(&json!({
            "network": input.network,
            "hash": hash,
            "invoice": invoice_value,
            "rules": input.rules_version,
        }))
        .as_bytes(),
    );

    let evidence = json!({
        "schema": "noshashi.xrpl-payment-evidence/1",
        "rule_version": input.rules_version,
        "network": input.network,
        "transaction_hash": hash,
        "evaluated_at": input.evaluated_at,
        // Raw: copied from what each source returned.
        "observed": input.reads.iter().map(observation_record).collect::<Vec<_>>(),
        // Supplied by the caller.
        "invoice": invoice_value,
        "prior_invoice": input.prior_invoice,
        // Derived by these rules from the two above.
        "derived": {
            "status": status,
            "reason_code": d.reason,
            "findings": d.findings.iter().map(|f| f.code).collect::<Vec<_>>(),
            "partial_payment": d.partial,
            "requested_amount": d.requested,
            "delivered_amount": d.delivered,
            "amount_difference": d.difference,
        },
    });
    let evidence_digest = digest(&evidence);

    VerificationReport {
        transaction_hash: hash,
        network: input.network,
        status,
        reason_code: d.reason,
        explanation: d
            .findings
            .first()
            .map(|f| f.explanation.clone())
            .unwrap_or_default(),
        findings: d.findings.clone(),
        validated: primary.and_then(|o| o.validated),
        ledger_index: primary.and_then(|o| o.ledger_index),
        transaction_result: primary.and_then(|o| o.transaction_result.clone()),
        transaction_type: primary.and_then(|o| o.transaction_type.clone()),
        requested_amount: d.requested.as_ref().map(AmountView::from),
        delivered_amount: d.delivered.as_ref().map(AmountView::from),
        partial_payment: d.partial,
        amount_difference: d.difference.clone(),
        amount_mismatch,
        invoice_id: input.invoice.map(|p| p.invoice_id.clone()),
        sources: input.reads.iter().map(|r| r.source().to_string()).collect(),
        observed_at: primary
            .map(|o| o.observed_at.clone())
            .unwrap_or_else(|| input.evaluated_at.to_string()),
        rule_version: input.rules_version.to_string(),
        decision_key,
        evidence_digest,
        evidence,
    }
}
