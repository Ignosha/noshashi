#!/usr/bin/env node
/**
 * Checks outreach/contacts.csv against the sourcing rules in SKILL.md.
 *
 *   node .claude/skills/institutional-outreach/check.mjs
 *
 * Errors fail the run; warnings are printed for a person to look at. It
 * cannot tell whether an address is real. It catches the ways a list goes
 * wrong: guessed or broker-sourced addresses, inboxes that must never get
 * a sales email, and rows that lost their source.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const file = resolve(root, "outreach/contacts.csv");

const COLUMNS = ["institution", "vertical", "segment", "country", "priority", "channel", "email", "contact_page", "note", "fit", "checked_on", "status"];
const CHANNELS = new Set(["compliance", "partnerships", "institutional", "business", "investor_relations", "general", "form", "website", "none", "not_researched"]);
const STATUSES = new Set(["verify_before_send", "verified", "contacted", "replied", "declined", "unsubscribed", "bounced", "find_contact", "skip"]);
// People-search and data-broker sites. Their addresses are inferred from a
// format, not published by the institution.
const BROKERS = /(rocketreach|zoominfo|contactout|lusha|leadiq|apollo\.io|signalhire|hunter\.io|aeroleads|datanyze|salezshark|getprospect|prospectoo|clay\.com|neverbounce|gulfleads)/i;
// Inboxes that exist for complaints, consumers, press, security or legal
// requests. A sales email there is a misuse of the channel.
const NEVER_PITCH = /^(ouvidoria|complaints?|reclamacoes|support|help|ajuda|care|customerservice|customer\.?service|press|media|pr|security|abuse|privacy|dpo|legal|lawenforcement|jobs|careers|hr)@/i;

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parse(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

const [header, ...body] = parse(readFileSync(file, "utf8"));
const errors = [], warnings = [];
if (header.join(",") !== COLUMNS.join(",")) errors.push(`header must be: ${COLUMNS.join(",")}`);

const seen = new Set();
body.forEach((cells, i) => {
  const line = i + 2;
  const r = Object.fromEntries(COLUMNS.map((k, j) => [k, (cells[j] ?? "").trim()]));
  const at = `line ${line} (${r.institution || "?"})`;
  if (cells.length !== COLUMNS.length) errors.push(`${at}: ${cells.length} fields, expected ${COLUMNS.length}`);
  if (!r.institution) errors.push(`${at}: no institution`);
  if (seen.has(r.institution.toLowerCase())) errors.push(`${at}: duplicate institution`);
  seen.add(r.institution.toLowerCase());
  if (!["0", "1", "2", "3"].includes(r.priority)) errors.push(`${at}: priority must be 0-3`);
  if (!CHANNELS.has(r.channel)) errors.push(`${at}: unknown channel "${r.channel}"`);
  if (!STATUSES.has(r.status)) errors.push(`${at}: unknown status "${r.status}"`);
  if (r.contact_page && BROKERS.test(r.contact_page)) errors.push(`${at}: contact_page is a data broker, not the institution`);
  if (r.contact_page && !/^https:\/\//.test(r.contact_page)) errors.push(`${at}: contact_page must be an https URL`);
  if ((r.email || r.contact_page) && !/^\d{4}-\d{2}-\d{2}$/.test(r.checked_on)) errors.push(`${at}: a contact needs checked_on (YYYY-MM-DD)`);

  if (!r.email) {
    if (["form", "website"].includes(r.channel) && !r.contact_page) errors.push(`${at}: channel ${r.channel} needs a contact_page`);
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(r.email)) errors.push(`${at}: malformed email "${r.email}"`);
  if (!r.contact_page) errors.push(`${at}: an email needs the contact_page it was published on`);
  if (NEVER_PITCH.test(r.email)) errors.push(`${at}: ${r.email} is a complaints, support, press or legal inbox; never pitch it`);
  if (["form", "website", "none", "not_researched"].includes(r.channel)) errors.push(`${at}: channel "${r.channel}" cannot carry an email`);
  // first.last@ or f.last@ looks like a person. Allowed only when the
  // note says where that person published it for business contact.
  const local = r.email.split("@")[0];
  const role = /^(info|contact|hello|team|sales|comercial|commercial|corporate|business|partners?(hip)?s?|institutional|institutions|compliance|investors?|ir|shareholders|group|desk|office|enquiries|inquiries)$/i;
  const parts = local.split(/[._]/);
  if (parts.length === 2 && parts.every((p) => /^[a-z]+$/i.test(p) && !role.test(p)) && !/published by (the person|the institution)/i.test(r.note)) {
    errors.push(`${at}: ${r.email} looks personal; keep role inboxes, or record in note where it was "published by the institution"`);
  }
  const domain = r.email.split("@")[1].toLowerCase();
  let host = "";
  try { host = new URL(r.contact_page).hostname.toLowerCase(); } catch {}
  const base = (h) => h.split(".").slice(-2).join(".");
  if (host && base(domain) !== base(host)) warnings.push(`${at}: ${domain} differs from the page host ${host}; confirm the address really belongs to this institution`);
});

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
const emails = body.filter((c) => (c[COLUMNS.indexOf("email")] ?? "").trim()).length;
console.log(`${body.length} institutions, ${emails} with a published email: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
