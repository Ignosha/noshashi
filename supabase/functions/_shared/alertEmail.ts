/**
 * Issuer Watch and wallet alerts as HTML email, in the Ledger Desk style
 * (DESIGN.md): graphite ground, warm off-white ink, Instrument Serif for
 * the headline, Inter for reading text, IBM Plex Mono for addresses and
 * labels, hairline rules, square corners and the ringed N monogram.
 *
 * It is built from the same plain text that Telegram and Discord receive,
 * so an email can never say something the chat alert does not:
 *
 *   line 1   "NOSHASHI · <kind>"            → kicker and serif headline
 *   line 2   the address and ledger          → monospace subject line
 *   🔴 🟠 🟢 ⚪ lines                          → numbered findings, coloured
 *   "<label>: https://www.noshashi.app/…"    → a link row
 *   "… Stop …: <url>"                         → the unsubscribe link, in the footer
 *   anything else                             → a paragraph
 *
 * Only noshashi.app URLs become links; anything else stays text. Tables
 * and inline styles, because that is what mail clients render, and every
 * cell states its own colours so a forced theme cannot hide the text.
 */

const SITE = "https://www.noshashi.app";
const C = {
  ground: "#10100F",
  surface: "#151514",
  ink: "#E9E6DC",
  muted: "#A9A69E",
  faint: "#99968F",
  rule: "#3D3C38",
  go: "#85C6AD",
  hold: "#D8B474",
  nogo: "#EE8790",
};
const SERIF = "'Instrument Serif',Georgia,'Times New Roman',serif";
const SANS = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace";

const SEVERITY: Record<string, { colour: string; label: string }> = {
  "🔴": { colour: C.nogo, label: "HIGH" },
  "🟠": { colour: C.hold, label: "WATCH" },
  "🟢": { colour: C.go, label: "INFO" },
  "⚪": { colour: C.faint, label: "INFO" },
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ours = (url: string) => url.startsWith(`${SITE}/`) && !/["'<>\s]/.test(url);

type Finding = { colour: string; label: string; text: string };

/** Split the alert text into its parts. Exported for tests. */
export function parseAlert(text: string) {
  const lines = String(text ?? "").split("\n");
  const head = (lines[0] ?? "").trim();
  const kind = head.includes("·") ? head.split("·").slice(1).join("·").trim() : head;
  const subject = (lines[1] ?? "").trim();
  const findings: Finding[] = [];
  const links: { label: string; url: string }[] = [];
  const paragraphs: string[] = [];
  let stop: { text: string; url: string } | null = null;

  for (const raw of lines.slice(2)) {
    const line = raw.trim();
    if (!line) continue;
    const mark = [...line][0];
    if (SEVERITY[mark]) {
      findings.push({ ...SEVERITY[mark], text: line.slice(mark.length).trim() });
      continue;
    }
    const stopMatch = line.match(/^(.*?)\s*Stop[^:]*:\s*(\S+)$/);
    if (stopMatch && ours(stopMatch[2])) {
      stop = { text: stopMatch[1].trim(), url: stopMatch[2] };
      continue;
    }
    const link = line.match(/^([^:]{1,40}):\s*(https:\/\/\S+)$/);
    if (link && ours(link[2])) {
      links.push({ label: link[1].trim(), url: link[2] });
      continue;
    }
    paragraphs.push(line);
  }
  return { kind, subject, findings, links, paragraphs, stop };
}

/** Capitalise the first letter: "issuer power change" → "Issuer power change". */
const title = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : "Issuer Watch alert");

/**
 * The alert as an HTML email. `note` is a closing sentence for the footer
 * (for example, how to cancel billing).
 */
export function alertEmailHtml(text: string, note = ""): string {
  const a = parseAlert(text);
  const label = `font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.faint}`;

  const findings = a.findings.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surface};border:1px solid ${C.rule};border-radius:2px;margin:0 0 22px">
<tr><td style="height:2px;background:${a.findings[0].colour};font-size:0;line-height:2px">&nbsp;</td></tr>
<tr><td style="padding:18px 22px 8px;background:${C.surface}"><div style="${label};margin:0 0 10px">What changed</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${a.findings
        .map(
          (f, i) =>
            `<tr><td valign="top" width="34" style="width:34px;padding:10px 0;font-family:${MONO};font-size:11px;color:${C.faint};border-top:1px solid ${C.rule};background:${C.surface}">${String(i + 1).padStart(2, "0")}</td><td style="padding:9px 0 11px;border-top:1px solid ${C.rule};background:${C.surface}"><div style="font-family:${MONO};font-size:10px;letter-spacing:1.6px;color:${f.colour};margin:0 0 4px">${f.label}</div><div style="font-family:${SANS};font-size:14.5px;line-height:1.6;color:${C.ink}">${esc(f.text)}</div></td></tr>`,
        )
        .join("")}</table></td></tr></table>`
    : "";

  const paragraphs = a.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.65;color:${C.muted}">${esc(p)}</p>`)
    .join("");

  const links = a.links
    .map(
      (l) =>
        `<tr><td style="padding:10px 0;border-top:1px solid ${C.rule};background:${C.ground}"><a href="${esc(l.url)}" style="font-family:${MONO};font-size:11.5px;letter-spacing:1.4px;text-transform:uppercase;color:${C.ink};text-decoration:underline">${esc(l.label)} &rarr;</a></td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(title(a.kind))}</title></head>
<body style="margin:0;padding:0;background:${C.ground}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(a.findings[0]?.text ?? a.subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}"><tr><td align="center" style="padding:32px 16px;background:${C.ground}">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="padding:0 0 20px;background:${C.ground}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="52" style="width:52px;padding-right:12px;background:${C.ground}"><img src="${SITE}/assets/ledger-mark-180.png" width="40" height="40" alt="NOSHASHI" style="display:block;border:0;width:40px;height:40px"></td>
<td style="font-family:${SERIF};font-size:22px;letter-spacing:.04em;color:${C.ink};background:${C.ground}">NOSHASHI</td>
<td align="right" style="${label};background:${C.ground}">Issuer Watch</td>
</tr></table></td></tr>
<tr><td style="border-top:1px solid ${C.ink};height:1px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="border-top:1px solid ${C.rule};padding:28px 0 6px;background:${C.ground}">
<div style="${label};margin:0 0 10px">Alert</div>
<div style="font-family:${SERIF};font-size:32px;line-height:1.12;letter-spacing:-.01em;color:${C.ink};margin:0 0 12px">${esc(title(a.kind))}</div>
<div style="font-family:${MONO};font-size:12px;line-height:1.6;color:${C.muted};word-break:break-all;margin:0 0 22px">${esc(a.subject)}</div>
${findings}${paragraphs}
${links ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px">${links}</table>` : ""}
</td></tr>
<tr><td style="border-top:1px solid ${C.rule};padding:20px 0 0;background:${C.ground}">
<div style="${label};font-size:9.5px;margin:0 0 8px">NOSHASHI &middot; Read-only XRPL evidence &middot; No keys, no signing</div>
<div style="font-family:${SANS};font-size:11.5px;line-height:1.6;color:${C.faint};margin:0 0 8px">${esc(a.stop?.text || "Ledger facts, not advice.")}${a.stop ? ` <a href="${esc(a.stop.url)}" style="color:${C.muted};text-decoration:underline">Stop these alerts</a>` : ""}</div>
${note ? `<div style="font-family:${SANS};font-size:11.5px;line-height:1.6;color:${C.faint}">${esc(note)}</div>` : ""}
</td></tr>
</table></td></tr></table></body></html>`;
}
