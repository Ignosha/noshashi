/**
 * The Ledger Evidence Report, as delivered: the delivery schedule each tier
 * buys, the plain-language findings, and the report document itself.
 *
 * Pure: no Deno APIs, no network. The edge function
 * (../noshashi-evidence-report/index.ts) reads the ledger through
 * NOSHASHI's public endpoints and hands the replies here. Tested by
 * tests/evidence-report.test.js, which also keeps TIERS equal to
 * api/_lib/evidence-tiers.js, the table the checkout charges from.
 *
 * Copy rules the whole product keeps: no score, no legal or accounting
 * finding, and a fact that could not be read is never shown as a pass.
 */

export type Tier = "standard" | "quarterly" | "audit";

export const TIERS: Record<Tier, { name: string; cents: number; cadence: "once" | "quarterly" | "monthly"; limits: { issuers: number; wallets: number; books: number } }> = {
  standard: { name: "Standard", cents: 250_000, cadence: "once", limits: { issuers: 3, wallets: 10, books: 3 } },
  quarterly: { name: "Quarterly", cents: 750_000, cadence: "quarterly", limits: { issuers: 3, wallets: 10, books: 3 } },
  audit: { name: "Audit support", cents: 1_000_000, cadence: "monthly", limits: { issuers: 6, wallets: 10, books: 6 } },
};

export const SITE = "https://www.noshashi.app";

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The last day of the month `months` after the month of `t` (UTC). */
function monthEnd(t: number, months: number): string {
  const d = new Date(t);
  return isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months + 1, 0));
}

export type Delivery = { period_end: string | null; due_on: string };

/**
 * What a paid order delivers, and when. The first report goes out at once
 * (or the day after the buyer's period end, when that is still ahead).
 * Quarterly adds the next four quarter-ends, Audit support the next twelve
 * month-ends, each due the day after: a period end is read at the last
 * ledger that closed on or before 23:59:59 UTC that day, so it cannot be
 * read before the day is over.
 */
export function schedule(tier: Tier, paidAt: Date, periodEnd: string | null): Delivery[] {
  const now = paidAt.getTime();
  const today = isoDay(now);
  const dayAfter = (d: string) => isoDay(Date.parse(`${d}T00:00:00Z`) + DAY);
  const first: Delivery = { period_end: periodEnd || null, due_on: periodEnd && dayAfter(periodEnd) > today ? dayAfter(periodEnd) : today };
  const out: Delivery[] = [first];
  const cadence = TIERS[tier].cadence;
  if (cadence === "once") return out;
  const ends: string[] = [];
  for (let m = 0; ends.length < (cadence === "quarterly" ? 4 : 12); m += 1) {
    const end = monthEnd(now, m);
    if (end < today) continue;
    const month = Number(end.slice(5, 7));
    if (cadence === "quarterly" && month % 3 !== 0) continue;
    ends.push(end);
  }
  for (const end of ends) {
    if (end === first.period_end) continue;
    out.push({ period_end: end, due_on: dayAfter(end) });
  }
  return out;
}

/** A currency longer than three characters is held on the ledger as 40 hex. */
export function currencyCode(code: string): string {
  if (/^[0-9A-Fa-f]{40}$/.test(code)) return code.toUpperCase();
  if (code.length === 3) return code;
  const hex = [...code].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")).join("");
  return (hex + "0".repeat(40)).slice(0, 40);
}

export function currencyLabel(code: string): string {
  if (!/^[0-9A-F]{40}$/i.test(code)) return code;
  let s = "";
  for (let i = 0; i < 40; i += 2) {
    const b = parseInt(code.slice(i, i + 2), 16);
    if (b) s += String.fromCharCode(b);
  }
  return /^[\x20-\x7e]+$/.test(s) ? s : code;
}

export type Scope = { issuers: string[]; wallets: string[]; books: string[] };

/** The public requests a report is built from, relative to SITE. */
export function requestsFor(scope: Scope, periodEnd: string | null): { kind: "issuer" | "treasury" | "book"; subject: string; path: string }[] {
  const out: { kind: "issuer" | "treasury" | "book"; subject: string; path: string }[] = [];
  for (const issuer of scope.issuers) out.push({ kind: "issuer", subject: issuer, path: `/api/authority?issuer=${encodeURIComponent(issuer)}&walk=1` });
  if (scope.wallets.length) {
    out.push({
      kind: "treasury",
      subject: scope.wallets.join(","),
      path: `/api/treasury?wallets=${scope.wallets.map(encodeURIComponent).join(",")}${periodEnd ? `&at=${periodEnd}` : ""}`,
    });
  }
  for (const book of scope.books) {
    const [currency, issuer] = book.split(".");
    out.push({ kind: "book", subject: book, path: `/api/book?currency=${encodeURIComponent(currencyCode(currency))}&issuer=${encodeURIComponent(issuer)}` });
  }
  return out;
}

// deno-lint-ignore no-explicit-any
type Any = any;
export type Source = { kind: "issuer" | "treasury" | "book"; subject: string; request: string; reply?: Any; error?: string };

const pct = (r: unknown) => (typeof r === "number" && Number.isFinite(r) ? `${(r * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%` : "—");
const num = (v: unknown, d = 2) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d });
};

/**
 * The findings in plain language, each one a fact from a reading with
 * where it came from. Nothing here is a judgement the readings do not
 * state; a reading that failed is said to have failed.
 */
export function findings(sources: Source[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    if (s.error) {
      out.push(`${s.kind === "issuer" ? "Issuer" : s.kind === "book" ? "Order book" : "Treasury"} ${s.subject}: could not be read (${s.error}). Nothing about it is reported as a pass.`);
      continue;
    }
    const r = s.reply;
    if (s.kind === "issuer") {
      for (const c of r.checks ?? []) {
        if (c.state === "INSUFFICIENT_DATA") continue;
        if (!c.passed) out.push(`Issuer ${s.subject} at ledger ${num(r.ledgerIndex, 0)}: "${c.label}" does not hold. ${c.detail}`);
      }
    } else if (s.kind === "treasury") {
      for (const w of r.wallets ?? []) {
        if (!w.found) out.push(`Wallet ${w.address}: no account at ledger ${num(r.ledger?.index, 0)}.`);
        else if (w.control?.readable === false) out.push(`Wallet ${w.address}: who can move it could not be read, so it is not shown as controlled.`);
        else if (w.control?.keys_needed === 1) out.push(`Wallet ${w.address}: a single key can move its ${num(w.balance_xrp, 6)} XRP (ledger ${num(r.ledger?.index, 0)}).`);
      }
      for (const b of r.books ?? []) {
        const share = b.sell?.funded_share;
        if (typeof share === "number" && share < 0.5) out.push(`Selling into ${b.label}: only ${pct(share)} of the quoted depth within 10% of mid was funded at ledger ${num(r.ledger?.index, 0)}.`);
      }
    } else if (s.kind === "book") {
      const ask = r.fillable_ratio?.ask;
      if (typeof ask === "number" && ask < 0.5) out.push(`Order book ${s.subject}: only ${pct(ask)} of the quoted ask within 10% of mid was funded at ledger ${num(r.ledger_index, 0)}.`);
    }
  }
  if (!out.length) out.push("No reading in this report found a retained power, a single-key wallet or a mostly unfunded book. The sections below give every fact read.");
  return out;
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function issuerSection(s: Source): string {
  let h = `<h3>${esc(s.subject)}</h3>`;
  if (s.error) return h + `<p class="bad">Could not be read: ${esc(s.error)}. Nothing in this section is shown as a pass.</p>`;
  const r = s.reply;
  h += `<p class="meta">Ledger ${num(r.ledgerIndex, 0)} · evaluated ${esc(r.evaluatedAt)} · rules version ${esc(r.rulesVersion)} · digest <span class="mono">${esc(r.digest)}</span></p>`;
  h += `<table><thead><tr><th>Fact</th><th>Reading</th><th>Detail</th></tr></thead><tbody>`;
  for (const c of r.checks ?? []) {
    const na = c.state === "INSUFFICIENT_DATA";
    const cls = na ? "na" : c.passed ? "ok" : c.severity === "block" ? "bad" : "warn";
    h += `<tr><td>${esc(c.label)}</td><td class="${cls}">${na ? "Not measured" : c.passed ? "Holds" : "Does not hold"}</td><td>${esc(c.detail)}</td></tr>`;
  }
  return h + `</tbody></table><p class="meta">${esc(r.disclaimer)}</p>`;
}

function treasurySection(s: Source, periodEnd: string | null): string {
  if (s.error) return `<p class="bad">Could not be read: ${esc(s.error)}. Nothing in this section is shown as a pass.</p>`;
  const r = s.reply;
  const L = r.ledger ?? {};
  let h = `<p class="meta">Ledger ${num(L.index, 0)} · hash <span class="mono">${esc(L.hash)}</span> · closed ${esc(L.close_time)} · ${
    periodEnd ? `last ledger to close on or before ${esc(periodEnd)} 23:59:59 UTC` : "latest validated ledger"
  } · digest <span class="mono">${esc(r.digest)}</span></p>`;
  h += `<table><thead><tr><th>Wallet</th><th class="num">Balance XRP</th><th class="num">Reserve XRP</th><th class="num">Available XRP</th><th>Who can move it</th></tr></thead><tbody>`;
  for (const w of r.wallets ?? []) {
    if (!w.found) {
      h += `<tr><td class="mono">${esc(w.address)}</td><td colspan="4" class="na">No account at this ledger.</td></tr>`;
      continue;
    }
    const c = w.control ?? {};
    const how =
      c.readable === false
        ? `<span class="na">Not readable: not shown as controlled.</span>`
        : `${esc(c.summary)}<br><span class="meta">Master key ${c.master_key_enabled ? "enabled" : "disabled"}${c.regular_key ? ` · regular key ${esc(c.regular_key)}` : " · no regular key"}${
            c.signer_list ? ` · signer list quorum ${esc(c.signer_list.quorum)} of total weight ${esc(c.signer_list.total_weight)} (${(c.signer_list.signers ?? []).length} signers)` : " · no signer list"
          }</span>`;
    h += `<tr><td class="mono">${esc(w.address)}</td><td class="num">${num(w.balance_xrp, 6)}</td><td class="num">${num(w.reserve_xrp, 6)}</td><td class="num">${num(w.available_xrp, 6)}</td><td>${how}</td></tr>`;
  }
  const t = r.totals ?? {};
  h += `<tr><th>Total (${num(t.found, 0)} of ${num(t.wallets, 0)} found)</th><th class="num">${num(t.balance_xrp, 6)}</th><th></th><th class="num">${num(t.available_xrp, 6)}</th><th>Fewest keys to move a wallet: ${num(t.fewest_keys_to_move_a_wallet, 0)}</th></tr></tbody></table>`;
  if ((r.books ?? []).length) {
    h += `<h3>Selling the holding into the main XRP books</h3><table><thead><tr><th>Book</th><th class="num">Funded share of quoted</th><th class="num">Funded capacity (XRP)</th><th class="num">Share of holding sellable</th><th class="num">Average price</th><th>AMM pool (not counted)</th></tr></thead><tbody>`;
    for (const b of r.books) {
      const sell = b.sell ?? {};
      const a = b.amm;
      h += `<tr><td>${esc(b.label)}</td><td class="num">${pct(sell.funded_share)}</td><td class="num">${num(sell.capacity_xrp, 0)}</td><td class="num">${pct(sell.share_of_holding_sellable)}</td><td class="num">${num(sell.average_price, 6)}</td><td>${
        a ? `${num(a.xrp, 0)} XRP · ${num(a.asset?.value, 0)} ${esc(currencyLabel(a.asset?.currency ?? ""))}` : "No pool"
      }</td></tr>`;
    }
    h += `</tbody></table>`;
  }
  return h + `<ul class="meta">${(r.disclosures ?? []).map((d: string) => `<li>${esc(d)}</li>`).join("")}</ul>`;
}

function bookSection(s: Source): string {
  let h = `<h3>${esc(s.subject)}</h3>`;
  if (s.error) return h + `<p class="bad">Could not be read: ${esc(s.error)}. Nothing in this section is shown as a pass.</p>`;
  const r = s.reply;
  const cur = esc(r.currency_label || currencyLabel(r.currency ?? ""));
  h += `<p class="meta">XRP/${cur} · ledger ${num(r.ledger_index, 0)} · read ${esc(r.read_at)} · ${esc(r.units)}</p>`;
  h += `<table><thead><tr><th>Side</th><th class="num">Quoted (${cur})</th><th class="num">Funded (${cur})</th><th class="num">Funded share</th></tr></thead><tbody>`;
  for (const side of ["bid", "ask"]) {
    h += `<tr><td>${side === "bid" ? "Bids (buying XRP)" : "Asks (selling XRP into)"}</td><td class="num">${num(r.quoted?.[side])}</td><td class="num">${num(r.fillable?.[side])}</td><td class="num">${pct(r.fillable_ratio?.[side])}</td></tr>`;
  }
  return h + `</tbody></table><p class="meta">Reference mid ${num(r.reference?.mid, 8)} XRP per ${cur}. ${(r.disclosures ?? []).map(esc).join(" ")}</p>`;
}

export type ReportInput = {
  reference: string;
  tier: Tier;
  organization: string | null;
  scope: Scope;
  periodEnd: string | null;
  generatedAt: string;
  sources: Source[];
  digest: string;
};

/** The report: one self-contained HTML file, printable to PDF from any browser. */
export function renderReport(input: ReportInput): string {
  const { scope, periodEnd, sources } = input;
  const issuers = sources.filter((s) => s.kind === "issuer");
  const treasury = sources.find((s) => s.kind === "treasury");
  const books = sources.filter((s) => s.kind === "book");
  let n = 0;
  const title = input.organization ? `Ledger Evidence Report: ${input.organization}` : "Ledger Evidence Report";
  let h = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#111;background:#fff;max-width:920px;margin:0 auto;padding:32px 20px}
h1{font-size:24px;margin:4px 0 8px}h2{font-size:17px;margin:30px 0 8px;border-bottom:1px solid #ccc;padding-bottom:5px;break-after:avoid}h3{font-size:14px;margin:18px 0 6px}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin:6px 0 10px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}tr{break-inside:avoid}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.mono{font:11px Menlo,Consolas,monospace;word-break:break-all}.meta{color:#555;font-size:12px}
.ok{color:#0a7a4b}.warn{color:#9a6400}.bad{color:#b4232f}.na{color:#666}.eyebrow{font:600 11px Menlo,Consolas,monospace;letter-spacing:.12em;color:#555;margin:0}
ul.find li{margin:4px 0}
</style></head><body>`;
  h += `<p class="eyebrow">NOSHASHI · LEDGER EVIDENCE REPORT · ${esc(TIERS[input.tier].name.toUpperCase())}</p><h1>${esc(input.organization || "Ledger Evidence Report")}</h1>`;
  h += `<p class="meta">Report ${esc(input.reference)} · generated ${esc(input.generatedAt)} from validated XRP Ledger mainnet${periodEnd ? ` · period end ${esc(periodEnd)}` : ""}<br>SHA-256 over the raw evidence: <span class="mono">${esc(input.digest)}</span><br>Confirm this report is authentic: <span class="mono">${SITE}/evidence-report/verify/?digest=${esc(input.digest)}</span></p>`;
  h += `<h2>${++n}. Findings in brief</h2><ul class="find">${findings(sources).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`;
  h += `<h2>${++n}. Scope</h2><table><tbody><tr><th>Issuing accounts</th><td class="mono">${scope.issuers.map(esc).join("<br>") || "—"}</td></tr><tr><th>Treasury wallets</th><td class="mono">${
    scope.wallets.map(esc).join("<br>") || "—"
  }</td></tr><tr><th>Order books</th><td class="mono">${scope.books.map(esc).join("<br>") || "—"}</td></tr><tr><th>Period end</th><td>${
    periodEnd ? `${esc(periodEnd)} (treasury section; issuer and book sections are read at the latest validated ledger when this report was generated)` : "None: every section is read at the latest validated ledger"
  }</td></tr></tbody></table>`;
  if (issuers.length) h += `<h2>${++n}. Issuer controls</h2>${issuers.map(issuerSection).join("")}`;
  if (treasury) h += `<h2>${++n}. Treasury: holdings and who can move them</h2>${treasurySection(treasury, periodEnd)}`;
  if (books.length) h += `<h2>${++n}. Order-book depth: quoted against funded</h2>${books.map(bookSection).join("")}`;
  h += `<h2>${++n}. How to re-check this report</h2><p class="meta">Each figure came from one of these public requests to ${SITE}, which read validated XRP Ledger mainnet. The evidence file sent with this report holds every reply exactly as received; its SHA-256 is stated above. A treasury section read at a period end can be re-read at the same ledger index.</p><ul class="meta">${sources
    .map((s) => `<li class="mono">${esc(SITE + s.request)}</li>`)
    .join("")}</ul>`;
  h += `<h2>${++n}. Limitations</h2><p class="meta">A record of public ledger facts at the stated ledger indexes, generated automatically. Not an audit opinion, an attestation, a valuation, fair-value guidance under any accounting standard, or a legal or compliance determination about any asset or person. Depth counts offers within 10% of each book's reference mid (a chosen parameter) and at most 100 offers per side; AMM pools are shown separately and not added. NOSHASHI did not hold, sign for or move any of the accounts named.</p>`;
  return h + `</body></html>`;
}

/** The evidence file: every reply as received. Its SHA-256 is the report's digest. */
export function evidenceOf(sources: Source[]): string {
  return JSON.stringify(sources);
}
