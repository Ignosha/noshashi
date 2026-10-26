//! Exact amounts.
//!
//! No floating point touches money here. XRP is an integer number of drops
//! (one XRP is 1,000,000 drops) and arrives as a JSON string of digits.
//! Issued-currency values arrive as decimal strings that rippled may write
//! in scientific notation ("1.5e-7"), with at most 16 significant digits.
//! Both are held as a [`Decimal`]: a sign, a digit string with no leading
//! or trailing zeros, and a power-of-ten exponent. Comparison and
//! subtraction work on the digits, so "0.10" and "1e-1" are equal and
//! 0.1 + 0.2 is exactly 0.3.

use std::cmp::Ordering;
use std::fmt;

use serde::{Deserialize, Serialize};

/// An exact decimal: `(-1)^negative × digits × 10^exponent`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Decimal {
    negative: bool,
    /// Significant digits, no leading or trailing zeros. Empty means zero.
    digits: String,
    exponent: i64,
}

/// Why a string is not an amount this module will accept.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AmountError {
    Empty,
    Malformed(String),
    Negative,
    TooPrecise,
    OutOfRange,
}

impl fmt::Display for AmountError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AmountError::Empty => write!(f, "empty amount"),
            AmountError::Malformed(s) => write!(f, "not a decimal amount: {s:?}"),
            AmountError::Negative => write!(f, "negative amount"),
            AmountError::TooPrecise => write!(f, "more precision than the asset allows"),
            AmountError::OutOfRange => write!(f, "amount out of range"),
        }
    }
}

/// XRP has 6 decimal places; the protocol caps supply at 10^17 drops.
pub const DROPS_PER_XRP_EXPONENT: i64 = -6;
const MAX_DROPS: u64 = 100_000_000_000_000_000;
/// rippled's issued-currency mantissa holds 16 significant digits.
const MAX_IOU_DIGITS: usize = 16;
const MAX_ABS_EXPONENT: i64 = 400;

impl Decimal {
    pub fn zero() -> Self {
        Decimal {
            negative: false,
            digits: String::new(),
            exponent: 0,
        }
    }

    pub fn is_zero(&self) -> bool {
        self.digits.is_empty()
    }

    pub fn is_negative(&self) -> bool {
        self.negative && !self.is_zero()
    }

    fn normalized(negative: bool, digits: &str, exponent: i64) -> Self {
        let trimmed_lead = digits.trim_start_matches('0');
        let trimmed = trimmed_lead.trim_end_matches('0');
        if trimmed.is_empty() {
            return Decimal::zero();
        }
        let dropped = (trimmed_lead.len() - trimmed.len()) as i64;
        Decimal {
            negative,
            digits: trimmed.to_string(),
            exponent: exponent + dropped,
        }
    }

    /// Parse `[-+]digits[.digits][e[-+]digits]`. Nothing else: no spaces,
    /// no hex, no "NaN", no thousands separators.
    pub fn parse(input: &str) -> Result<Self, AmountError> {
        let s = input;
        if s.is_empty() {
            return Err(AmountError::Empty);
        }
        let bad = || AmountError::Malformed(input.chars().take(40).collect());
        let (negative, rest) = match s.as_bytes()[0] {
            b'-' => (true, &s[1..]),
            b'+' => (false, &s[1..]),
            _ => (false, s),
        };
        let (mantissa, exp_part) = match rest.find(['e', 'E']) {
            Some(i) => (&rest[..i], Some(&rest[i + 1..])),
            None => (rest, None),
        };
        let (int_part, frac_part) = match mantissa.find('.') {
            Some(i) => (&mantissa[..i], &mantissa[i + 1..]),
            None => (mantissa, ""),
        };
        if int_part.is_empty() && frac_part.is_empty() {
            return Err(bad());
        }
        if !int_part.bytes().all(|b| b.is_ascii_digit())
            || !frac_part.bytes().all(|b| b.is_ascii_digit())
        {
            return Err(bad());
        }
        let exp: i64 = match exp_part {
            None => 0,
            Some(e) => {
                let digits = e.strip_prefix(['-', '+']).unwrap_or(e);
                if digits.is_empty()
                    || digits.len() > 6
                    || !digits.bytes().all(|b| b.is_ascii_digit())
                {
                    return Err(bad());
                }
                e.parse::<i64>().map_err(|_| bad())?
            }
        };
        if exp.abs() > MAX_ABS_EXPONENT {
            return Err(AmountError::OutOfRange);
        }
        let all_digits = format!("{int_part}{frac_part}");
        Ok(Decimal::normalized(
            negative,
            &all_digits,
            exp - frac_part.len() as i64,
        ))
    }

    /// An exact XRP amount from a drops string ("1000000" is 1 XRP).
    pub fn from_drops_str(drops: &str) -> Result<Self, AmountError> {
        if drops.is_empty() {
            return Err(AmountError::Empty);
        }
        if drops.starts_with('-') {
            return Err(AmountError::Negative);
        }
        if !drops.bytes().all(|b| b.is_ascii_digit()) || drops.len() > 18 {
            return Err(AmountError::Malformed(drops.chars().take(40).collect()));
        }
        let n: u64 = drops
            .parse()
            .map_err(|_| AmountError::Malformed(drops.to_string()))?;
        if n > MAX_DROPS {
            return Err(AmountError::OutOfRange);
        }
        Ok(Decimal::normalized(false, drops, DROPS_PER_XRP_EXPONENT))
    }

    /// An issued-currency value, held to the ledger's own precision.
    pub fn from_iou_str(value: &str) -> Result<Self, AmountError> {
        let d = Decimal::parse(value)?;
        if d.is_negative() {
            return Err(AmountError::Negative);
        }
        if d.digits.len() > MAX_IOU_DIGITS {
            return Err(AmountError::TooPrecise);
        }
        Ok(d)
    }

    /// Exact drops for an XRP amount, or an error if it has finer than drop
    /// precision. Used to check an invoice's expected XRP amount.
    pub fn to_drops(&self) -> Result<u64, AmountError> {
        if self.is_negative() {
            return Err(AmountError::Negative);
        }
        if self.is_zero() {
            return Ok(0);
        }
        let shift = self.exponent - DROPS_PER_XRP_EXPONENT;
        if shift < 0 {
            return Err(AmountError::TooPrecise);
        }
        if self.digits.len() as i64 + shift > 18 {
            return Err(AmountError::OutOfRange);
        }
        let s = format!("{}{}", self.digits, "0".repeat(shift as usize));
        let n: u64 = s.parse().map_err(|_| AmountError::OutOfRange)?;
        if n > MAX_DROPS {
            return Err(AmountError::OutOfRange);
        }
        Ok(n)
    }

    /// Order of magnitude: position of the leading digit.
    fn magnitude(&self) -> i64 {
        self.digits.len() as i64 + self.exponent
    }

    fn cmp_abs(&self, other: &Self) -> Ordering {
        match (self.is_zero(), other.is_zero()) {
            (true, true) => return Ordering::Equal,
            (true, false) => return Ordering::Less,
            (false, true) => return Ordering::Greater,
            _ => {}
        }
        match self.magnitude().cmp(&other.magnitude()) {
            Ordering::Equal => {}
            o => return o,
        }
        // Same magnitude: compare digit by digit, padding the shorter.
        let n = self.digits.len().max(other.digits.len());
        let a = format!("{:0<n$}", self.digits);
        let b = format!("{:0<n$}", other.digits);
        a.cmp(&b)
    }

    /// `self - other`, exactly.
    pub fn sub(&self, other: &Self) -> Decimal {
        self.add(&other.negated())
    }

    pub fn negated(&self) -> Decimal {
        if self.is_zero() {
            return self.clone();
        }
        Decimal {
            negative: !self.negative,
            ..self.clone()
        }
    }

    /// `self + other`, exactly, by aligning both to the smaller exponent.
    pub fn add(&self, other: &Self) -> Decimal {
        if self.is_zero() {
            return other.clone();
        }
        if other.is_zero() {
            return self.clone();
        }
        let exp = self.exponent.min(other.exponent);
        let a = format!(
            "{}{}",
            self.digits,
            "0".repeat((self.exponent - exp) as usize)
        );
        let b = format!(
            "{}{}",
            other.digits,
            "0".repeat((other.exponent - exp) as usize)
        );
        if self.negative == other.negative {
            return Decimal::normalized(self.negative, &add_digits(&a, &b), exp);
        }
        // Opposite signs: subtract the smaller magnitude from the larger.
        match cmp_digit_strings(&a, &b) {
            Ordering::Equal => Decimal::zero(),
            Ordering::Greater => Decimal::normalized(self.negative, &sub_digits(&a, &b), exp),
            Ordering::Less => Decimal::normalized(other.negative, &sub_digits(&b, &a), exp),
        }
    }

    /// Plain decimal notation, no exponent: "0.0000001", "1000".
    pub fn to_plain_string(&self) -> String {
        if self.is_zero() {
            return "0".to_string();
        }
        let sign = if self.negative { "-" } else { "" };
        if self.exponent >= 0 {
            return format!(
                "{sign}{}{}",
                self.digits,
                "0".repeat(self.exponent as usize)
            );
        }
        let frac_len = (-self.exponent) as usize;
        if self.digits.len() > frac_len {
            let (i, f) = self.digits.split_at(self.digits.len() - frac_len);
            format!("{sign}{i}.{f}")
        } else {
            format!(
                "{sign}0.{}{}",
                "0".repeat(frac_len - self.digits.len()),
                self.digits
            )
        }
    }
}

impl Ord for Decimal {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self.is_negative(), other.is_negative()) {
            (false, true) => Ordering::Greater,
            (true, false) => Ordering::Less,
            (false, false) => self.cmp_abs(other),
            (true, true) => other.cmp_abs(self),
        }
    }
}

impl PartialOrd for Decimal {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Display for Decimal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_plain_string())
    }
}

impl Serialize for Decimal {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        // As a string: a JSON number would invite a float on the other side.
        s.serialize_str(&self.to_plain_string())
    }
}

impl<'de> Deserialize<'de> for Decimal {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Decimal::parse(&s).map_err(serde::de::Error::custom)
    }
}

fn cmp_digit_strings(a: &str, b: &str) -> Ordering {
    let a = a.trim_start_matches('0');
    let b = b.trim_start_matches('0');
    a.len().cmp(&b.len()).then_with(|| a.cmp(b))
}

fn add_digits(a: &str, b: &str) -> String {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let mut out = Vec::with_capacity(a.len().max(b.len()) + 1);
    let (mut i, mut j, mut carry) = (a.len(), b.len(), 0u8);
    while i > 0 || j > 0 || carry > 0 {
        let x = if i > 0 {
            i -= 1;
            a[i] - b'0'
        } else {
            0
        };
        let y = if j > 0 {
            j -= 1;
            b[j] - b'0'
        } else {
            0
        };
        let s = x + y + carry;
        out.push(b'0' + s % 10);
        carry = s / 10;
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_default()
}

/// `a - b` for digit strings with `a >= b`.
fn sub_digits(a: &str, b: &str) -> String {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let mut out = Vec::with_capacity(a.len());
    let (mut i, mut j, mut borrow) = (a.len(), b.len(), 0i8);
    while i > 0 {
        i -= 1;
        let x = (a[i] - b'0') as i8 - borrow;
        let y = if j > 0 {
            j -= 1;
            (b[j] - b'0') as i8
        } else {
            0
        };
        let (d, br) = if x < y { (x + 10 - y, 1) } else { (x - y, 0) };
        out.push(b'0' + d as u8);
        borrow = br;
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_default()
}

/// What an amount is denominated in. Two issued assets are the same only
/// when both currency and issuer match: USD from one issuer is not USD
/// from another.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Asset {
    Xrp,
    Issued { currency: String, issuer: String },
}

impl Asset {
    /// Currency codes compared case-sensitively for 3-character codes, and
    /// case-insensitively for the 40-hex form (rippled may echo either case).
    pub fn same_as(&self, other: &Asset) -> bool {
        match (self, other) {
            (Asset::Xrp, Asset::Xrp) => true,
            (
                Asset::Issued {
                    currency: c1,
                    issuer: i1,
                },
                Asset::Issued {
                    currency: c2,
                    issuer: i2,
                },
            ) => {
                let cur = if c1.len() == 40 && c2.len() == 40 {
                    c1.eq_ignore_ascii_case(c2)
                } else {
                    c1 == c2
                };
                cur && i1 == i2
            }
            _ => false,
        }
    }
}

/// An amount as the ledger recorded it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Amount {
    pub asset: Asset,
    pub value: Decimal,
}

/// The ledger's amount field held something this engine does not read.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ParsedAmount {
    Known(Amount),
    /// Multi-purpose tokens and any other object shape not implemented.
    Unsupported(String),
    Malformed(String),
}

/// Read an XRPL amount field: a drops string for XRP, or an object with
/// `currency`, `issuer` and `value` for an issued currency.
pub fn parse_ledger_amount(raw: &serde_json::Value) -> ParsedAmount {
    match raw {
        serde_json::Value::String(drops) => match Decimal::from_drops_str(drops) {
            Ok(value) => ParsedAmount::Known(Amount {
                asset: Asset::Xrp,
                value,
            }),
            Err(e) => ParsedAmount::Malformed(format!("XRP drops: {e}")),
        },
        serde_json::Value::Object(o) => {
            if o.contains_key("mpt_issuance_id") {
                return ParsedAmount::Unsupported("multi-purpose token (MPT) amount".into());
            }
            let (Some(c), Some(i), Some(v)) = (o.get("currency"), o.get("issuer"), o.get("value"))
            else {
                return ParsedAmount::Unsupported(
                    "amount object without currency, issuer and value".into(),
                );
            };
            let (Some(c), Some(i), Some(v)) = (c.as_str(), i.as_str(), v.as_str()) else {
                return ParsedAmount::Malformed("issued amount fields are not strings".into());
            };
            if c == "XRP" || c.is_empty() || i.is_empty() {
                return ParsedAmount::Malformed(
                    "issued amount with XRP or empty currency, or no issuer".into(),
                );
            }
            match Decimal::from_iou_str(v) {
                Ok(value) => ParsedAmount::Known(Amount {
                    asset: Asset::Issued {
                        currency: c.to_string(),
                        issuer: i.to_string(),
                    },
                    value,
                }),
                Err(e) => ParsedAmount::Malformed(format!("issued value: {e}")),
            }
        }
        _ => ParsedAmount::Malformed("amount is neither a drops string nor an object".into()),
    }
}
