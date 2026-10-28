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

export type Tier = "standard" | "quarterly" | "audit" | "test";

export const TIERS: Record<Tier, { name: string; cents: number; cadence: "once" | "quarterly" | "monthly"; limits: { issuers: number; wallets: number; books: number } }> = {
  standard: { name: "Standard", cents: 250_000, cadence: "once", limits: { issuers: 3, wallets: 10, books: 3 } },
  quarterly: { name: "Quarterly", cents: 750_000, cadence: "quarterly", limits: { issuers: 3, wallets: 10, books: 3 } },
  audit: { name: "Audit support", cents: 1_000_000, cadence: "monthly", limits: { issuers: 6, wallets: 10, books: 6 } },
  // Not sold: a Standard report at Stripe's minimum charge, so the owner can
  // test a real card payment end to end. The checkout only offers it when
  // EVIDENCE_TEST_EMAIL is set, and locks the receipt to that address.
  test: { name: "Test", cents: 50, cadence: "once", limits: { issuers: 3, wallets: 10, books: 3 } },
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

/** rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De → rMxCKb…J8m5De, for prose and tables. */
export const short = (address: string) => (address.length > 16 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/**
 * What each issuer check means for someone holding the token, in words a
 * board member can read. Keyed by the check ids /api/authority returns;
 * a check this table does not know falls back to the reading's own detail.
 */
const CHECK_WORDS: Record<string, { holds: string; fails: string }> = {
  FREEZE_SURRENDERED: {
    holds: "The issuer has permanently given up the power to freeze holders' balances.",
    fails: "The issuer can still freeze any holder's balance of this token, at any time and without notice.",
  },
  NOT_GLOBALLY_FROZEN: {
    holds: "No freeze is in effect: holders can move the token today.",
    fails: "Every holding of this token is frozen right now.",
  },
  OPEN_HOLDING: {
    holds: "Anyone can hold the token without asking the issuer first.",
    fails: "Each holder needs the issuer's approval before they can hold the token.",
  },
  NO_UNILATERAL_SIGNER: {
    holds: "No single key can act for the issuer on its own.",
    fails: "One key alone can act for the issuer, including issuing more of the token.",
  },
  SUPPLY_CONCENTRATION: {
    holds: "No single holder controls an outsized share of the supply.",
    fails: "A small number of holders control a large share of the supply.",
  },
};

/**
 * The findings that matter, in plain English: each one a fact from a
 * reading, said the way a person would say it, with the ledger it was
 * read at. Nothing here is a judgement the readings do not state; a
 * reading that failed is said to have failed.
 */
export function findings(sources: Source[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    if (s.error) {
      const what = s.kind === "issuer" ? `the issuing account ${short(s.subject)}` : s.kind === "book" ? `the ${s.subject.split(".")[0]} order book` : "the treasury wallets";
      out.push(`We could not read ${what} from the XRP Ledger, so this report makes no statement about it.`);
      continue;
    }
    const r = s.reply;
    if (s.kind === "issuer") {
      for (const c of r.checks ?? []) {
        if (c.state === "INSUFFICIENT_DATA" || c.passed) continue;
        out.push(`${CHECK_WORDS[c.id]?.fails ?? `${c.label}: does not hold. ${c.detail}`} (Issuer ${short(s.subject)}, ledger ${num(r.ledgerIndex, 0)}.)`);
      }
    } else if (s.kind === "treasury") {
      for (const w of r.wallets ?? []) {
        if (!w.found) out.push(`Wallet ${short(w.address)} does not exist on the ledger at ledger ${num(r.ledger?.index, 0)}.`);
        else if (w.control?.readable === false) out.push(`We could not read who controls wallet ${short(w.address)}, so it is not shown as controlled.`);
        else if (w.control?.keys_needed === 1) out.push(`One key alone can move wallet ${short(w.address)}, which holds ${num(w.balance_xrp, 2)} XRP.`);
      }
      for (const b of r.books ?? []) {
        const share = b.sell?.funded_share;
        if (typeof share === "number" && share < 0.5) {
          out.push(`On the ${b.label} order book, only ${pct(share)} of the advertised buying interest within 10% of the market price was backed by funds. A large sale there would fill far less than the book suggests.`);
        }
      }
    } else if (s.kind === "book") {
      const ask = r.fillable_ratio?.ask;
      if (typeof ask === "number" && ask < 0.5) {
        const cur = r.currency_label || currencyLabel(r.currency ?? "");
        out.push(`On the XRP/${cur} order book (issuer ${short(String(r.issuer ?? s.subject.split(".")[1]))}), only ${pct(ask)} of the advertised selling depth within 10% of the market price was backed by funds; the rest are offers their owners can no longer pay for.`);
      }
    }
  }
  if (!out.length) out.push("Nothing we read raised a concern: no retained issuer power, no wallet that one key can move, and no order book that is mostly unfunded. The detail follows.");
  return out;
}

// ── The report, as a document ───────────────────────────────────────

export type Tone = "good" | "warn" | "bad" | "muted" | null;
export type Block =
  | { type: "heading"; text: string }
  | { type: "subheading"; text: string }
  | { type: "para"; text: string; small?: boolean }
  | { type: "bullets"; items: string[] }
  | { type: "facts"; rows: [string, string][] }
  | { type: "table"; columns: { label: string; width: number; align?: "left" | "right" }[]; rows: { cells: string[]; tones?: Tone[] }[] };

export type ReportModel = { title: string; subtitle: string; meta: [string, string][]; blocks: Block[]; footer: string };

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

/**
 * Everything the report says, laid out as blocks the PDF renderer draws
 * (../_shared/evidencePdf.ts). Kept here, free of any PDF library, so the
 * words and the tables are tested on their own.
 */
export function reportModel(input: ReportInput): ReportModel {
  const { scope, periodEnd, sources } = input;
  const issuers = sources.filter((s) => s.kind === "issuer");
  const treasury = sources.find((s) => s.kind === "treasury");
  const books = sources.filter((s) => s.kind === "book");
  const ledgers = sources.map((s) => s.reply?.ledgerIndex ?? s.reply?.ledger?.index ?? s.reply?.ledger_index).filter((v) => typeof v === "number");
  const counted = [
    scope.issuers.length && `${scope.issuers.length} issuing account${scope.issuers.length > 1 ? "s" : ""}`,
    scope.wallets.length && `${scope.wallets.length} treasury wallet${scope.wallets.length > 1 ? "s" : ""}`,
    scope.books.length && `${scope.books.length} order book${scope.books.length > 1 ? "s" : ""}`,
  ].filter(Boolean) as string[];
  const list = counted.length > 1 ? `${counted.slice(0, -1).join(", ")} and ${counted[counted.length - 1]}` : counted[0] ?? "no accounts";
  const blocks: Block[] = [];
  let n = 0;

  blocks.push({ type: "heading", text: `${++n}. Summary` });
  blocks.push({
    type: "para",
    text: `On ${fmtDate(input.generatedAt)} we read ${list} directly from the XRP Ledger${
      ledgers.length ? `, at ledger ${num(Math.max(...ledgers), 0)}` : ""
    }. Every statement below comes from that reading and nothing else: no estimates, no third-party data, and nothing we were told.${
      periodEnd ? ` Treasury holdings are stated as at the close of ${fmtDate(`${periodEnd}T12:00:00Z`)} (UTC).` : ""
    }`,
  });
  blocks.push({ type: "subheading", text: "What stood out" });
  blocks.push({ type: "bullets", items: findings(sources) });

  if (issuers.length) {
    blocks.push({ type: "heading", text: `${++n}. Issuer controls` });
    blocks.push({ type: "para", text: "What the issuer of each token can still do to the people holding it. These are powers written into the issuer's account on the ledger, not policies or promises." });
    for (const s of issuers) {
      blocks.push({ type: "subheading", text: `Issuer ${short(s.subject)}` });
      if (s.error) {
        blocks.push({ type: "para", text: `This account could not be read (${s.error}). Nothing about it is shown as safe.` });
        continue;
      }
      const r = s.reply;
      blocks.push({
        type: "table",
        columns: [
          { label: "Question", width: 0.3 },
          { label: "Answer", width: 0.16 },
          { label: "What it means", width: 0.54 },
        ],
        rows: (r.checks ?? []).map((c: Any) => {
          const na = c.state === "INSUFFICIENT_DATA";
          const words = CHECK_WORDS[c.id];
          const meaning = na ? "Not measured in this report." : words ? (c.passed ? words.holds : words.fails) : c.detail;
          return {
            cells: [c.label, na ? "Not measured" : c.passed ? "Yes" : "No", c.id === "NO_UNILATERAL_SIGNER" && !na ? `${meaning} ${c.detail}` : meaning],
            tones: [null, na ? "muted" : c.passed ? "good" : c.severity === "block" ? "bad" : "warn", null],
          };
        }),
      });
      blocks.push({ type: "para", small: true, text: `Full address ${s.subject}. Read at ledger ${num(r.ledgerIndex, 0)}.` });
    }
  }

  if (treasury) {
    blocks.push({ type: "heading", text: `${++n}. Treasury holdings and control` });
    if (treasury.error) {
      blocks.push({ type: "para", text: `The treasury wallets could not be read (${treasury.error}). Nothing about them is shown as safe.` });
    } else {
      const r = treasury.reply;
      const L = r.ledger ?? {};
      blocks.push({
        type: "para",
        text: `How much each wallet held, how much of it was free to move (the rest is locked by the ledger as a reserve), and how many separate keys it takes to move it. Read at ledger ${num(L.index, 0)}, which closed ${L.close_time ? fmtDate(L.close_time) : "—"}${periodEnd ? `, the last ledger of ${fmtDate(`${periodEnd}T12:00:00Z`)}` : ""}.`,
      });
      const rows: { cells: string[]; tones?: Tone[] }[] = (r.wallets ?? []).map((w: Any) => {
        if (!w.found) return { cells: [short(w.address), "—", "—", "Not found on the ledger"], tones: [null, null, null, "muted"] };
        const c = w.control ?? {};
        const keys = c.readable === false ? "Could not be read" : c.keys_needed === 1 ? "1 key (single point of control)" : c.keys_needed ? `${c.keys_needed} keys must agree` : c.summary ?? "—";
        return {
          cells: [short(w.address), num(w.balance_xrp, 2), num(w.available_xrp, 2), keys],
          tones: [null, null, null, c.readable === false ? "muted" : c.keys_needed === 1 ? "warn" : "good"],
        };
      });
      const t = r.totals ?? {};
      rows.push({ cells: [`Total (${num(t.found, 0)} of ${num(t.wallets, 0)} found)`, num(t.balance_xrp, 2), num(t.available_xrp, 2), ""] });
      blocks.push({
        type: "table",
        columns: [
          { label: "Wallet", width: 0.24 },
          { label: "Balance (XRP)", width: 0.2, align: "right" },
          { label: "Free to move (XRP)", width: 0.22, align: "right" },
          { label: "Keys needed to move it", width: 0.34 },
        ],
        rows,
      });
      if ((r.books ?? []).length) {
        blocks.push({ type: "subheading", text: "If the holding were sold" });
        blocks.push({ type: "para", text: "How much of the advertised demand on each main XRP order book was real: offers whose owners still held the money to pay. AMM pools are listed separately and are not counted as depth." });
        blocks.push({
          type: "table",
          columns: [
            { label: "Order book", width: 0.22 },
            { label: "Real share of advertised depth", width: 0.26, align: "right" },
            { label: "Real depth (XRP)", width: 0.2, align: "right" },
            { label: "AMM pool alongside", width: 0.32 },
          ],
          rows: r.books.map((b: Any) => ({
            cells: [
              b.label,
              pct(b.sell?.funded_share),
              num(b.sell?.capacity_xrp, 0),
              b.amm ? `${num(b.amm.xrp, 0)} XRP + ${num(b.amm.asset?.value, 0)} ${currencyLabel(b.amm.asset?.currency ?? "")}` : "None",
            ],
            tones: [null, typeof b.sell?.funded_share === "number" ? (b.sell.funded_share < 0.5 ? "warn" : "good") : "muted", null, null],
          })),
        });
      }
      blocks.push({ type: "para", small: true, text: `Wallets in full: ${(r.wallets ?? []).map((w: Any) => w.address).join(", ")}. Ledger hash ${L.hash ?? "—"}.` });
    }
  }

  if (books.length) {
    blocks.push({ type: "heading", text: `${++n}. Order-book depth` });
    blocks.push({ type: "para", text: "An order book shows offers to buy and sell. Some offers stay on the book after their owner has spent the money behind them, so the book looks deeper than it is. This separates what is advertised from what is backed by funds, within 10% of the market price." });
    blocks.push({
      type: "table",
      columns: [
        { label: "Book", width: 0.24 },
        { label: "Side", width: 0.2 },
        { label: "Advertised", width: 0.19, align: "right" },
        { label: "Backed by funds", width: 0.19, align: "right" },
        { label: "Real share", width: 0.18, align: "right" },
      ],
      rows: books.flatMap((s) => {
        const [cur, issuer] = s.subject.split(".");
        const name = `XRP/${s.reply?.currency_label || currencyLabel(cur)} (${short(issuer ?? "")})`;
        if (s.error) return [{ cells: [name, "Could not be read", "—", "—", "—"], tones: [null, "muted", null, null, null] as Tone[] }];
        const r = s.reply;
        const unit = r.currency_label || currencyLabel(r.currency ?? "");
        return (["ask", "bid"] as const).map((side) => ({
          cells: [side === "ask" ? name : "", side === "ask" ? "Selling (asks)" : "Buying (bids)", `${num(r.quoted?.[side], 0)} ${unit}`, `${num(r.fillable?.[side], 0)} ${unit}`, pct(r.fillable_ratio?.[side])],
          tones: [null, null, null, null, typeof r.fillable_ratio?.[side] === "number" ? (r.fillable_ratio[side] < 0.5 ? "warn" : "good") : "muted"] as Tone[],
        }));
      }),
    });
    blocks.push({
      type: "para",
      small: true,
      text: books.map((s) => (s.error ? "" : `${s.subject.split(".")[0]}: ledger ${num(s.reply.ledger_index, 0)}, market price ${num(s.reply.reference?.mid ? 1 / s.reply.reference.mid : null, 4)} ${s.reply.currency_label ?? ""} per XRP.`)).filter(Boolean).join(" "),
    });
  }

  blocks.push({ type: "heading", text: `${++n}. How to check this report` });
  blocks.push({
    type: "para",
    text: `This report comes with an evidence file holding every reply the XRP Ledger gave us, exactly as received. Its fingerprint (SHA-256) is below. Anyone, your auditor included, can confirm the report was issued by NOSHASHI and has not been changed: go to noshashi.app/evidence-report/verify and enter the fingerprint. Every figure can also be re-read independently from the public XRP Ledger at the ledger numbers stated.`,
  });
  blocks.push({ type: "facts", rows: [["Fingerprint (SHA-256)", input.digest], ["Report reference", input.reference]] });

  blocks.push({ type: "heading", text: `${++n}. Important information` });
  blocks.push({
    type: "para",
    small: true,
    text: "This report records public facts from the XRP Ledger at the ledger numbers stated, generated automatically by NOSHASHI. It is not an audit opinion, an attestation, a valuation, fair-value guidance under any accounting standard, investment advice, or a legal or compliance determination about any asset or person. Order-book depth counts offers within 10% of each book's market price (a parameter we chose) and at most 100 offers on each side; AMM pools are shown separately and not added. NOSHASHI did not hold, sign for or move any of the accounts named, and never asks for keys or seeds. Terms of sale: noshashi.app/legal/report-terms.",
  });

  return {
    title: "Ledger Evidence Report",
    subtitle: input.organization ? `Prepared for ${input.organization}` : "XRP Ledger facts, stamped with the ledger they were read at",
    meta: [
      ["Report", input.reference],
      ["Date", fmtDate(input.generatedAt)],
      ["Plan", TIERS[input.tier].name],
      ["Period end", periodEnd ? fmtDate(`${periodEnd}T12:00:00Z`) : "Latest ledger"],
    ],
    blocks,
    footer: `NOSHASHI · Ledger Evidence Report ${input.reference}${input.organization ? ` · Prepared for ${input.organization}` : ""}`,
  };
}

// ── The email that carries it ────────────────────────────────────────

const escHtml = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type EmailInput = { reference: string; organization: string | null; periodEnd: string | null; digest: string; findings: string[]; tier: Tier };

/** A short, plain letter: what is attached, what stood out, how to check it. One link. */
export function emailText(e: EmailInput): string {
  return [
    "Hello,",
    "",
    `Your Ledger Evidence Report${e.organization ? ` for ${e.organization}` : ""} is attached as a PDF${e.periodEnd ? `, with treasury holdings as at ${fmtDate(`${e.periodEnd}T12:00:00Z`)}` : ""}.`,
    "",
    "What stood out:",
    ...e.findings.map((f) => `  • ${f}`),
    "",
    "The second attachment is the evidence file: every reply the XRP Ledger gave us, exactly as received. Your auditor can confirm the report is genuine and unchanged by entering its fingerprint at noshashi.app/evidence-report/verify:",
    `  ${e.digest}`,
    "",
    "If anything in the report raises a question, just reply to this email.",
    "",
    "Kind regards,",
    "Joshua Edmond",
    "Founder, NOSHASHI",
    "",
    `Report ${e.reference}. A record of public ledger facts, not an audit opinion, valuation or legal finding.`,
  ].join("\n");
}

/**
 * The same letter as HTML, in noshashi.app's look: the dark green ground,
 * a raised panel, the flower mark, mono labels and one lime button. Laid
 * out with tables and inline styles, because that is what mail clients
 * render; every cell states its own colours so a client's own theme
 * cannot paint dark text on the dark ground.
 */
export function emailHtml(e: EmailInput): string {
  const verify = `${SITE}/evidence-report/verify/?digest=${e.digest}`;
  const sans = "'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const mono = "'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace";
  const body = `font-family:${sans};color:#E9F5E7;font-size:15px;line-height:1.65`;
  const label = `font-family:${mono};font-size:10px;letter-spacing:2.4px;text-transform:uppercase;color:#718473`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Your Ledger Evidence Report</title></head>
<body style="margin:0;padding:0;background:#08100B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#08100B"><tr><td align="center" style="padding:32px 12px;background:#08100B">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="padding:0 4px 22px;background:#08100B">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:10px;background:#08100B"><img src="${SITE}/assets/flower-mark-64.png" width="26" height="26" alt="" style="display:block;border:0"></td>
<td style="font-family:${sans};font-size:14px;font-weight:600;letter-spacing:3px;color:#E9F5E7;background:#08100B">NOSHASHI</td>
</tr></table></td></tr>
<tr><td style="background:#0E1911;border:1px solid #263B2A;border-radius:10px;padding:34px 32px 30px;${body}">
<div style="width:40px;height:2px;background:#9BE15D;margin:0 0 18px;font-size:0;line-height:0">&nbsp;</div>
<div style="${label};margin:0 0 8px">Ledger Evidence Report</div>
<div style="font-family:${sans};font-size:24px;font-weight:600;line-height:1.2;letter-spacing:-0.4px;color:#E9F5E7;margin:0 0 22px">${e.organization ? `Prepared for ${escHtml(e.organization)}` : "Your report is ready"}</div>
<p style="margin:0 0 14px;color:#E9F5E7">Hello,</p>
<p style="margin:0 0 20px;color:#A7B8A8">Your Ledger Evidence Report is attached as a PDF${e.periodEnd ? `, with treasury holdings as at ${escHtml(fmtDate(`${e.periodEnd}T12:00:00Z`))}` : ""}. Every statement in it was read directly from the XRP Ledger and is stamped with the ledger it came from.</p>
<div style="${label};margin:0 0 10px">What stood out</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px">${e.findings
    .map(
      (f) =>
        `<tr><td valign="top" style="width:18px;padding:7px 0 0;background:#0E1911"><div style="width:6px;height:6px;background:#9BE15D;font-size:0;line-height:0">&nbsp;</div></td><td style="padding:0 0 10px;font-family:${sans};font-size:14.5px;line-height:1.6;color:#E9F5E7;background:#0E1911">${escHtml(f)}</td></tr>`,
    )
    .join("")}</table>
<p style="margin:0 0 20px;color:#A7B8A8">The second attachment is the evidence file: every reply the XRP Ledger gave us, exactly as received. Anyone, your auditor included, can confirm the report is genuine and unchanged from its fingerprint.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px"><tr><td style="background:#9BE15D;border-radius:10px">
<a href="${escHtml(verify)}" style="display:inline-block;padding:12px 22px;font-family:${sans};font-size:14px;font-weight:600;color:#08100B;text-decoration:none">Verify this report</a></td></tr></table>
<p style="margin:0 0 14px;color:#A7B8A8">If anything in the report raises a question, just reply to this email.</p>
<p style="margin:0;color:#E9F5E7">Kind regards,<br>Joshua Edmond<br><span style="color:#718473">Founder, NOSHASHI</span></p>
</td></tr>
<tr><td style="padding:20px 6px 0;background:#08100B">
<div style="${label};font-size:9.5px;margin:0 0 6px">Report ${escHtml(e.reference)} · ${escHtml(TIERS[e.tier].name)} plan</div>
<div style="font-family:${mono};font-size:10.5px;color:#718473;word-break:break-all;margin:0 0 10px">${escHtml(e.digest)}</div>
<div style="font-family:${sans};font-size:11.5px;line-height:1.6;color:#718473">A record of public XRP Ledger facts at the ledger numbers stated. Not an audit opinion, valuation, investment advice or legal finding. NOSHASHI · Read-only XRPL intelligence · No custody, no keys, no signing.</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

/** The evidence file: every reply as received. Its SHA-256 is the report's digest. */
export function evidenceOf(sources: Source[]): string {
  return JSON.stringify(sources);
}
