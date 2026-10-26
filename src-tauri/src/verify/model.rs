//! The verification contract: what goes in, what comes out.
//!
//! Three layers are kept apart on purpose:
//!   * evidence: what the ledger source returned, copied, not interpreted;
//!   * interpretation: what that evidence means for this payment
//!     (validated? succeeded? what actually arrived?);
//!   * policy: whether that satisfies this invoice.
//!
//! A technically valid payment can still be REJECTED for an invoice, and
//! a perfectly good invoice can be HOLD because the evidence is not final.

use serde::{Deserialize, Serialize};

use super::amount::{Amount, Asset, Decimal};

/// Bumped whenever a rule changes what status or reason a given input gets.
/// It is part of every evidence digest, so a record states which rules
/// produced it.
pub const RULES_VERSION: &str = "xrpl-payment/1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Status {
    /// Every check this engine performs passed for this invoice.
    Verified,
    /// Evidence is missing, not final, inconsistent, or needs a human.
    Hold,
    /// A confirmed fact fails an explicit requirement.
    Rejected,
}

/// Stable codes. Never renamed within a rules version; new ones are added.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Reason {
    /// Delivered amount meets the invoice; payment is not partial.
    Settled,
    /// Partial payment, delivered meets the invoice, and the policy allows partial payments.
    SettledPartialPermitted,
    /// Transaction facts only: no invoice policy was supplied, so nothing is settled.
    NoInvoicePolicy,
    InvalidHash,
    HashMismatch,
    NotFound,
    NotValidated,
    MissingMetadata,
    MissingResult,
    TransactionFailed,
    NotPayment,
    DeliveredUnavailable,
    DeliveredMissing,
    UnsupportedAsset,
    MalformedAmount,
    MalformedResponse,
    AssetMismatch,
    DestinationMismatch,
    DestinationTagMismatch,
    Underpaid,
    PartialNotPermitted,
    /// Delivered more than invoiced and the policy asks for review of overpayments.
    OverpaidReview,
    /// This transaction was already applied to a different invoice.
    AlreadyApplied,
    SourceUnavailable,
    SourceDisagreement,
    InvalidPolicy,
    /// Informational finding: the payment carries tfPartialPayment. Never
    /// the deciding reason on its own.
    PartialPaymentFlagged,
}

impl Reason {
    pub fn status(self) -> Status {
        use Reason::*;
        match self {
            Settled | SettledPartialPermitted => Status::Verified,
            InvalidHash
            | TransactionFailed
            | NotPayment
            | AssetMismatch
            | DestinationMismatch
            | DestinationTagMismatch
            | Underpaid
            | PartialNotPermitted
            | AlreadyApplied
            | InvalidPolicy => Status::Rejected,
            // A source answering with a different transaction is the
            // source's fault, not the payer's: hold, do not reject.
            HashMismatch
            | NoInvoicePolicy
            | NotFound
            | NotValidated
            | MissingMetadata
            | MissingResult
            | DeliveredUnavailable
            | DeliveredMissing
            | UnsupportedAsset
            | MalformedAmount
            | MalformedResponse
            | OverpaidReview
            | SourceUnavailable
            | SourceDisagreement
            | PartialPaymentFlagged => Status::Hold,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Network {
    Mainnet,
    Testnet,
}

/// What the merchant expects. Supplied by the caller, never inferred from
/// the transaction.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InvoicePolicy {
    pub invoice_id: String,
    /// The account that must receive the payment.
    pub destination: String,
    /// Required destination tag, when the receiving account uses tags.
    #[serde(default)]
    pub destination_tag: Option<u32>,
    pub asset: Asset,
    /// In units of the asset (XRP, not drops), as a decimal string.
    pub expected_amount: Decimal,
    /// Largest shortfall still accepted, in units of the asset. Zero unless set.
    #[serde(default)]
    pub underpayment_tolerance: Option<Decimal>,
    /// Accept a payment flagged tfPartialPayment when what it delivered
    /// meets the invoice. Off by default.
    #[serde(default)]
    pub allow_partial_payment: bool,
    /// Hold overpayments for review instead of verifying them.
    #[serde(default)]
    pub hold_overpayment: bool,
}

/// The facts read from one source about one transaction. `None` means the
/// source did not provide it; nothing is defaulted.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Observation {
    pub source: String,
    pub observed_at: String,
    pub returned_hash: Option<String>,
    pub validated: Option<bool>,
    pub ledger_index: Option<u64>,
    pub transaction_type: Option<String>,
    pub transaction_result: Option<String>,
    pub account: Option<String>,
    pub destination: Option<String>,
    pub destination_tag: Option<u32>,
    pub flags: Option<u64>,
    /// `Amount` or `DeliverMax`: what the sender asked to deliver.
    pub requested_raw: Option<serde_json::Value>,
    /// `meta.delivered_amount`: what arrived. May be the string "unavailable".
    pub delivered_raw: Option<serde_json::Value>,
    pub has_meta: bool,
}

/// One check and its outcome, in words a person can follow.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Finding {
    pub code: Reason,
    pub explanation: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct AmountView {
    pub asset: Asset,
    pub value: Decimal,
}

impl From<&Amount> for AmountView {
    fn from(a: &Amount) -> Self {
        AmountView {
            asset: a.asset.clone(),
            value: a.value.clone(),
        }
    }
}

/// The result, in the contract's field names.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct VerificationReport {
    pub transaction_hash: String,
    pub network: Network,
    pub status: Status,
    pub reason_code: Reason,
    pub explanation: String,
    /// Every finding, the deciding one first.
    pub findings: Vec<Finding>,
    pub validated: Option<bool>,
    pub ledger_index: Option<u64>,
    pub transaction_result: Option<String>,
    pub transaction_type: Option<String>,
    pub requested_amount: Option<AmountView>,
    pub delivered_amount: Option<AmountView>,
    pub partial_payment: Option<bool>,
    /// Delivered minus expected, in units of the asset; negative is a shortfall.
    pub amount_difference: Option<Decimal>,
    /// True when the requested and delivered amounts differ.
    pub amount_mismatch: Option<bool>,
    pub invoice_id: Option<String>,
    pub sources: Vec<String>,
    pub observed_at: String,
    pub rule_version: String,
    /// Same transaction, invoice and rules → same key. Use it to deduplicate.
    pub decision_key: String,
    /// SHA-256 over the canonical evidence record.
    pub evidence_digest: String,
    /// The record the digest covers.
    pub evidence: serde_json::Value,
}
