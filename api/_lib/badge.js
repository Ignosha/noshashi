/*
 * The issuer authority badge, as an SVG.
 *
 * A badge is the certificate shrunk to what fits on a README, a token
 * page or an exchange listing: the authority an issuer has kept, read
 * from validated ledger state, with the ledger it was read at. It links
 * back to /certificate/, where the full reading and its digest live.
 *
 * What it deliberately does not show is the certificate's verdict. The
 * badge reads flags only — it does not walk holder lines, because an
 * image that takes thirty seconds to load is an image nobody embeds —
 * and without the walk SUPPLY_CONCENTRATION abstains, so the verdict
 * could never be better than HOLD for any issuer at all. Printing that
 * on every badge would be true and useless. So the badge prints the
 * facts it did read, each one separately, and no aggregate: the same
 * "not a score" rule the certificate page keeps.
 *
 * The colour of the value half is the worst severity among the facts
 * shown, by the same rule verdictFor() uses — a failed block check is
 * red, a failed warn check amber, otherwise green — and grey when the
 * issuer could not be read. Grey is never green: an unreadable issuer
 * is not a clean one.
 *
 * Everything here is pure: certificate in, SVG string out. Every piece
 * of text is escaped, because this SVG is served from our own origin
 * and an issuer address is the only input, but the currency label and
 * the check details come from the ledger.
 */

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const x = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * The checks a flags-only reading can answer, in the order a holder
 * cares about them. SUPPLY_CONCENTRATION is absent on purpose (see
 * above); a badge that listed it would list an abstention every time.
 */
const FACTS = [
  {
    id: "NO_UNILATERAL_SIGNER",
    key: "signer",
    value: (c) =>
      c.passed
        ? /blackholed/i.test(c.detail) ? "blackholed" : /signers must agree/i.test(c.detail) ? "multisig" : "none can sign"
        : /could not be read/i.test(c.detail) ? "unknown" : "single key",
  },
  { id: "FREEZE_SURRENDERED", key: "freeze", value: (c) => (c.passed ? "surrendered" : "retained") },
  { id: "NOT_GLOBALLY_FROZEN", key: "global freeze", value: (c) => (c.passed ? "off" : "ACTIVE") },
  { id: "OPEN_HOLDING", key: "holding", value: (c) => (c.passed ? "open" : "permissioned") },
  {
    id: "NO_TRANSFER_FEE",
    key: "fee",
    value: (c) => {
      if (c.passed) return "0%";
      const m = /charges ([0-9.]+)%/.exec(c.detail);
      return m ? `${m[1]}%` : "set";
    },
  },
];

/** The facts on the one-line badge. The card shows all of FACTS. */
const FLAT_KEYS = new Set(["signer", "freeze", "fee"]);

/** A check the flags-only reading never reached is "not read", not a pass. */
export function badgeFacts(certificate) {
  // No certificate at all (the read threw) is unreadable. Without this
  // the missing NO_TRANSFER_FEE below would print "fee 0%" on a badge
  // for an issuer that was never read.
  if (!certificate?.checks?.length) return { readable: false, facts: [] };
  const byId = new Map(certificate.checks.map((c) => [c.id, c]));
  const unreadable = byId.get("AUTHORITY_READABLE");
  if (unreadable && !unreadable.passed) return { readable: false, facts: [] };

  const facts = FACTS.map((f) => {
    const check = byId.get(f.id);
    // NO_TRANSFER_FEE is only pushed when a fee is set, so its absence
    // in an otherwise readable certificate means no fee.
    if (!check && f.id === "NO_TRANSFER_FEE") {
      return { key: f.key, value: "0%", tone: "go", id: f.id };
    }
    if (!check) return { key: f.key, value: "not read", tone: "unknown", id: f.id };
    const tone = check.passed ? "go" : check.severity === "block" ? "nogo" : "hold";
    return { key: f.key, value: f.value(check), tone, id: f.id };
  });
  return { readable: true, facts };
}

/** The worst tone among the facts, by verdictFor()'s ordering. */
export function worstTone(facts) {
  if (!facts.length) return "unknown";
  if (facts.some((f) => f.tone === "nogo")) return "nogo";
  if (facts.some((f) => f.tone === "unknown")) return "unknown";
  if (facts.some((f) => f.tone === "hold")) return "hold";
  return "go";
}

const THEMES = {
  light: { bg: "#fbfaf7", fg: "#1d1f1c", mute: "#5f655c", line: "#dcd9d0", label: "#3b3f39" },
  dark: { bg: "#15171a", fg: "#e9e7e1", mute: "#9aa096", line: "#2c3036", label: "#2a2e33" },
};
const TONES = {
  light: { go: "#2f7a4b", hold: "#9a6a12", nogo: "#a23b2e", unknown: "#6b7068" },
  dark: { go: "#3f9a63", hold: "#b5822a", nogo: "#c0503f", unknown: "#5c625a" },
};

/*
 * Text width without a font engine. The badge sets a monospace stack, so
 * every glyph is the same advance: 0.6em is right for Menlo, Consolas,
 * DejaVu Sans Mono and SF Mono to within a pixel at 11px. A badge that
 * measured wrong would clip its own value, so this errs wide.
 */
const ADVANCE = 0.61;
const textWidth = (text, size) => Math.ceil(String(text).length * size * ADVANCE);
const FONT = "ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono',monospace";

const short = (address) => (address.length > 14 ? `${address.slice(0, 7)}…${address.slice(-5)}` : address);

function describe({ issuer, ledgerIndex, digest, readable, facts }) {
  const line = readable
    ? facts.map((f) => `${f.key}: ${f.value}`).join("; ")
    : "issuer could not be read from validated ledger state";
  return `XRPL issuer authority for ${issuer}${ledgerIndex ? ` at ledger ${ledgerIndex}` : ""}: ${line}.`
    + (digest ? ` Certificate digest ${digest}.` : "")
    + " Ledger facts, not a score or a legal finding. Source: noshashi.app/certificate";
}

/** One line, shields-style: label | facts. */
export function flatBadge({ certificate, issuer, theme = "light" }) {
  const t = THEMES[theme] ?? THEMES.light;
  const tones = TONES[theme] ?? TONES.light;
  const { readable, facts } = badgeFacts(certificate);
  const shown = facts.filter((f) => FLAT_KEYS.has(f.key));
  const value = readable ? shown.map((f) => `${f.key} ${f.value}`).join(" · ") : "unreadable";
  const label = "XRPL authority";
  const size = 11;
  const pad = 7;
  const lw = textWidth(label, size) + pad * 2;
  const vw = textWidth(value, size) + pad * 2;
  const w = lw + vw;
  const h = 20;
  const tone = readable ? worstTone(shown) : "unknown";
  const title = describe({
    issuer,
    ledgerIndex: certificate?.ledgerIndex,
    digest: certificate?.digest,
    readable,
    facts: shown,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${x(title)}">`
    + `<title>${x(title)}</title>`
    + `<clipPath id="r"><rect width="${w}" height="${h}" rx="3"/></clipPath>`
    + `<g clip-path="url(#r)"><rect width="${lw}" height="${h}" fill="${t.label}"/>`
    + `<rect x="${lw}" width="${vw}" height="${h}" fill="${tones[tone]}"/></g>`
    + `<g fill="#fff" font-family="${FONT}" font-size="${size}" text-rendering="geometricPrecision">`
    + `<text x="${pad}" y="14">${x(label)}</text>`
    + `<text x="${lw + pad}" y="14">${x(value)}</text></g></svg>`;
}

/** A card: every fact on its own row, the ledger and where to check it. */
export function cardBadge({ certificate, issuer, theme = "light" }) {
  const t = THEMES[theme] ?? THEMES.light;
  const tones = TONES[theme] ?? TONES.light;
  const { readable, facts } = badgeFacts(certificate);
  const w = 340;
  const rowH = 19;
  const top = 50;
  const rows = readable ? facts.length : 1;
  const h = top + rows * rowH + 34;
  const tone = readable ? worstTone(facts) : "unknown";
  const title = describe({
    issuer,
    ledgerIndex: certificate?.ledgerIndex,
    digest: certificate?.digest,
    readable,
    facts,
  });
  const currency = certificate?.currencyLabel ? ` · ${certificate.currencyLabel.split(" ")[0]}` : "";

  let body = "";
  if (readable) {
    facts.forEach((f, i) => {
      const y = top + i * rowH + 13;
      body += `<circle cx="22" cy="${y - 4}" r="3.5" fill="${tones[f.tone]}"/>`
        + `<text x="34" y="${y}" fill="${t.mute}">${x(f.key)}</text>`
        + `<text x="${w - 18}" y="${y}" fill="${t.fg}" text-anchor="end">${x(f.value)}</text>`;
    });
  } else {
    body = `<text x="18" y="${top + 13}" fill="${t.mute}">Issuer could not be read. Not a clearance.</text>`;
  }

  const foot = certificate?.ledgerIndex ? `ledger ${certificate.ledgerIndex}` : "ledger not read";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${x(title)}">`
    + `<title>${x(title)}</title>`
    + `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="8" fill="${t.bg}" stroke="${t.line}"/>`
    + `<rect x=".5" y=".5" width="4" height="${h - 1}" rx="2" fill="${tones[tone]}"/>`
    + `<g font-family="${FONT}" font-size="11" text-rendering="geometricPrecision">`
    + `<text x="18" y="22" fill="${t.fg}" font-weight="600">XRPL issuer authority${x(currency)}</text>`
    + `<text x="18" y="38" fill="${t.mute}">${x(short(issuer))}</text>`
    + body
    + `<line x1="18" x2="${w - 18}" y1="${h - 26}" y2="${h - 26}" stroke="${t.line}"/>`
    + `<text x="18" y="${h - 11}" fill="${t.mute}" font-size="10">${x(foot)}</text>`
    + `<text x="${w - 18}" y="${h - 11}" fill="${t.mute}" font-size="10" text-anchor="end">noshashi.app/certificate</text>`
    + `</g></svg>`;
}
