//! Which transaction already settled which invoice.
//!
//! The verifier is a pure function, so asking twice gives the same answer
//! twice. What it cannot know on its own is that a transaction was already
//! used: one payment presented against two invoices is a double credit.
//! The book remembers that for the life of the process. It is not
//! persistent and not shared between machines; a hosted service would keep
//! the same mapping in its database with a unique constraint on the hash.

use std::collections::HashMap;

#[derive(Debug, Default)]
pub struct SettlementBook {
    applied: HashMap<String, String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Recorded {
    /// First time this transaction settled anything.
    New,
    /// Same transaction, same invoice: recording again changes nothing.
    AlreadyRecorded,
}

impl SettlementBook {
    /// The invoice this transaction already settled, if any.
    pub fn prior_invoice(&self, hash: &str) -> Option<&str> {
        self.applied
            .get(&hash.to_ascii_uppercase())
            .map(String::as_str)
    }

    /// Record a verified settlement. Refuses a second, different invoice.
    pub fn record(&mut self, hash: &str, invoice_id: &str) -> Result<Recorded, String> {
        let key = hash.to_ascii_uppercase();
        match self.applied.get(&key) {
            Some(existing) if existing == invoice_id => Ok(Recorded::AlreadyRecorded),
            Some(existing) => Err(format!("transaction already settled invoice {existing}")),
            None => {
                self.applied.insert(key, invoice_id.to_string());
                Ok(Recorded::New)
            }
        }
    }
}
