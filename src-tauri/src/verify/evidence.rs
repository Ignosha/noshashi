//! Canonical evidence and its digest.
//!
//! The digest is SHA-256 over a canonical JSON form defined here, not over
//! whatever order a serializer happens to emit: object keys sorted by
//! their UTF-8 bytes at every depth, no whitespace, strings escaped as
//! serde_json escapes them, numbers as serde_json prints them (this engine
//! puts money in strings, never in JSON numbers).
//!
//! What a digest proves, and what it does not:
//!   * content integrity: a record re-hashes to its digest only if not one
//!     byte of it changed;
//!   * not authenticity: anyone can compute a digest; a signature would be
//!     needed to show who produced the record;
//!   * not ledger truth: it fixes what the source said, not that the source
//!     was right. Ledger validation and agreement between independent
//!     sources are separate checks, recorded inside the evidence.

use serde_json::Value;
use sha2::{Digest, Sha256};

/// Write `value` in canonical form.
pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_canonical(value, &mut out);
    out
}

fn write_canonical(value: &Value, out: &mut String) {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| a.as_bytes().cmp(b.as_bytes()));
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(k).unwrap_or_default());
                out.push(':');
                write_canonical(&map[k.as_str()], out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        other => out.push_str(&serde_json::to_string(other).unwrap_or_default()),
    }
}

/// Upper-case hex SHA-256 of the canonical form.
pub fn digest(value: &Value) -> String {
    hex_sha256(canonical_json(value).as_bytes())
}

pub fn hex_sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect()
}
