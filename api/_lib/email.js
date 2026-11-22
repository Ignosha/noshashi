/*
 * Branded HTML email, in the Ledger Desk style (DESIGN.md, 2026-11).
 *
 * Graphite ground, a warm off-white ink, Instrument Serif for the one
 * headline, Inter for reading text, IBM Plex Mono for labels and
 * evidence, hairline rules and square corners. Verdict colours (go,
 * hold, no-go) appear only where something has a verdict.
 *
 * Email is not the web, and most "branded email" breaks on these:
 *
 *   - Layout is tables. Flex and grid are unsupported in Outlook's Word
 *     rendering engine, which is still a large share of institutional
 *     inboxes, and that is the audience this product has.
 *   - Styles are inline. Gmail strips <style> blocks in several
 *     contexts, so anything that matters is on the element.
 *   - Web fonts do not load in most clients. Each face is named first
 *     and falls back: the serif to Georgia, Inter to the system sans,
 *     Plex Mono to the system mono. The typography degrades rather than
 *     breaking.
 *   - Every cell states its own background and colour. A client that
 *     forces its own theme will otherwise paint dark text on the dark
 *     ground, which is unreadable and invisible in testing.
 *   - The width is 600px, the widest that survives a phone without
 *     horizontal scroll.
 *   - No SVG. Gmail, Outlook and Yahoo strip it, so the mark is a
 *     hosted PNG with alt text.
 *
 * Colours are DESIGN.md's Ledger Desk tokens, hard-coded because email
 * has no custom properties.
 */

import { esc, attrUrl } from "./html.js";

export const T = {
  ground: "#10100F",
  surface: "#151514",
  elevated: "#1D1D1B",
  ink: "#E9E6DC",
  muted: "#A9A69E",
  faint: "#99968F",
  rule: "#3D3C38",
  brand: "#E9E6DC",
  tele: "#85C6AD",
  go: "#85C6AD",
  hold: "#D8B474",
  nogo: "#EE8790",
};

export const SERIF = "'Instrument Serif',Georgia,'Times New Roman',serif";
export const SANS = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
export const MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SITE = "https://www.noshashi.app";

/*
 * The ringed N monogram on its own graphite tile, so it reads on a
 * client that forces a light theme as well as on the dark ground.
 * Served at 180px, shown at 40. Many clients block images by default,
 * and the alt is then the logo.
 */
const MARK_URL = `${SITE}/assets/ledger-mark-180.png`;
const MARK = `<img src="${MARK_URL}" width="40" height="40" alt="NOSHASHI"
  style="display:block;border:0;outline:none;text-decoration:none;width:40px;height:40px;">`;

/** A monospace, letter-spaced label: the desk's figure caption. */
export function eyebrow(text) {
  return `<p style="margin:0 0 10px;font-family:${MONO};font-size:10px;letter-spacing:.2em;
    text-transform:uppercase;color:${T.faint};">${esc(text)}</p>`;
}

/** The one headline, in the display serif. */
export function headline(text, { size = 34 } = {}) {
  return `<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:${size}px;font-weight:400;
    letter-spacing:-.01em;color:${T.ink};line-height:1.12;">${esc(text)}</h1>`;
}

/** A paragraph of reading text. `tone` is "ink" or "muted". */
export function para(text, { tone = "muted", size = 15 } = {}) {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:${size}px;
    color:${tone === "ink" ? T.ink : T.muted};line-height:1.65;">${esc(text)}</p>`;
}

/**
 * A ruled record, the desk's panel: square, hairline, no shadow. An
 * accent draws a short rule across the top, used only for a verdict
 * colour or the ink.
 */
export function panel(inner, { accent = null } = {}) {
  const cap = accent
    ? `<tr><td style="height:2px;background:${accent};line-height:2px;font-size:0;">&nbsp;</td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${T.surface};border:1px solid ${T.rule};border-radius:2px;margin:0 0 18px;">
    ${cap}
    <tr><td style="padding:22px 24px;background:${T.surface};">${inner}</td></tr>
  </table>`;
}

/** Label and value pairs in monospace, for evidence rows. */
export function facts(rows) {
  const tr = (rows || []).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) =>
    `<tr><td style="padding:7px 18px 7px 0;font-family:${MONO};font-size:10px;letter-spacing:.14em;
       text-transform:uppercase;color:${T.faint};white-space:nowrap;vertical-align:top;border-bottom:1px solid ${T.rule};">${esc(k)}</td>
     <td style="padding:7px 0;font-family:${MONO};font-size:12.5px;color:${T.ink};word-break:break-all;
       border-bottom:1px solid ${T.rule};">${esc(v)}</td></tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${tr}</table>`;
}

/** The one call to action: an ink slab with graphite text. Bulletproof enough for Outlook. */
export function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;">
    <tr><td style="background:${T.ink};border-radius:2px;">
      <a href="${attrUrl(href)}" style="display:inline-block;padding:12px 24px;font-family:${MONO};
        font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${T.ground};
        text-decoration:none;">${esc(label)} &rarr;</a>
    </td></tr></table>`;
}

/** A log entry, numbered like the desk's figures. */
export function logEntry({ kind, title, body, at, url }, index = 0) {
  const colour = { release: T.go, maintenance: T.hold, incident: T.nogo }[kind] || T.faint;
  const date = String(at || "").slice(0, 10);
  const no = String(index + 1).padStart(2, "0");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="margin:0;border-top:1px solid ${T.rule};">
    <tr>
      <td valign="top" width="44" style="width:44px;padding:16px 0 18px;font-family:${MONO};font-size:11px;
        letter-spacing:.1em;color:${T.faint};">${no}</td>
      <td valign="top" style="padding:16px 0 18px;">
        <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;letter-spacing:.14em;color:${T.faint};">
          ${esc(date)} &nbsp;&middot;&nbsp; <span style="color:${colour};">${esc(String(kind || "note").toUpperCase())}</span>
        </p>
        <p style="margin:0 0 6px;font-family:${SERIF};font-size:21px;font-weight:400;color:${T.ink};line-height:1.25;">
          ${esc(title)}</p>
        <p style="margin:0;font-family:${SANS};font-size:14px;color:${T.muted};line-height:1.62;">${esc(body)}</p>
        ${url ? `<p style="margin:8px 0 0;"><a href="${attrUrl(url)}" style="font-family:${MONO};font-size:11px;
          letter-spacing:.12em;color:${T.ink};text-decoration:underline;">READ MORE &rarr;</a></p>` : ""}
      </td>
    </tr></table>`;
}

/**
 * Wrap body content in the shell.
 *
 * `preheader` is the line a client shows next to the subject in the
 * list view. Left unset, clients scrape the first text they find, which
 * is usually a fragment of the header, so it is always set explicitly.
 * `kicker` is the small mono line beside the wordmark ("Product update",
 * "Evidence report").
 */
export function shell({ title, preheader = "", body, unsubscribeUrl = null, footNote = "", kicker = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${T.ground};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">
${esc(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background:${T.ground};">
<tr><td align="center" style="padding:32px 16px;background:${T.ground};">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
    style="width:600px;max-width:100%;">

    <tr><td style="padding:0 0 20px;background:${T.ground};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="52" style="width:52px;padding-right:12px;" valign="middle">${MARK}</td>
        <td valign="middle" style="font-family:${SERIF};font-size:22px;font-weight:400;
          letter-spacing:.04em;color:${T.ink};">NOSHASHI</td>
        <td valign="middle" align="right" style="font-family:${MONO};font-size:10px;letter-spacing:.18em;
          text-transform:uppercase;color:${T.faint};">${esc(kicker || "Ledger Desk")}</td>
      </tr></table>
    </td></tr>

    <tr><td style="border-top:1px solid ${T.ink};padding:0;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
    <tr><td style="border-top:1px solid ${T.rule};padding:28px 0 8px;background:${T.ground};">${body}</td></tr>

    <tr><td style="border-top:1px solid ${T.rule};padding:22px 0 0;background:${T.ground};">
      <p style="margin:6px 0 10px;font-family:${MONO};font-size:10px;letter-spacing:.14em;color:${T.faint};">
        NOSHASHI &nbsp;&middot;&nbsp; READ-ONLY XRPL EVIDENCE &nbsp;&middot;&nbsp; NO KEYS, NO SIGNING</p>
      <p style="margin:0 0 12px;font-family:${SANS};font-size:12px;color:${T.faint};line-height:1.6;">
        ${footNote ? esc(footNote) : "You are receiving this because you subscribed to product updates at noshashi.app."}
      </p>
      <p style="margin:0;font-family:${SANS};font-size:12px;color:${T.faint};">
        <a href="${SITE}/" style="color:${T.muted};text-decoration:none;">noshashi.app</a>
        &nbsp;&middot;&nbsp;
        <a href="${SITE}/status/" style="color:${T.muted};text-decoration:none;">Status</a>
        &nbsp;&middot;&nbsp;
        <a href="${SITE}/contact/" style="color:${T.muted};text-decoration:none;">Contact</a>
        ${unsubscribeUrl ? `&nbsp;&middot;&nbsp;<a href="${attrUrl(unsubscribeUrl)}"
          style="color:${T.faint};text-decoration:underline;">Unsubscribe</a>` : ""}
      </p>
      <p style="margin:14px 0 0;font-family:${SANS};font-size:11px;color:${T.faint};line-height:1.6;">
        Nothing in this email is legal, regulatory, tax or investment advice.
      </p>
    </td></tr>

  </table>
</td></tr></table>
</body>
</html>`;
}

/** The welcome sent on subscribe. */
export function welcomeEmail({ unsubscribeUrl } = {}) {
  const body = `
    ${eyebrow("Subscribed")}
    ${headline("You're on the list.")}
    ${para("You'll get an email when we ship a new release or a new free check, or find a risk on the XRP Ledger worth knowing about. Only when there is news, and nothing else.")}
    ${panel(`
      ${eyebrow("What NOSHASHI does")}
      <p style="margin:0 0 12px;font-family:${SERIF};font-size:22px;color:${T.ink};line-height:1.3;">
        Checks XRP Ledger risk before you move money.</p>
      <p style="margin:0;font-family:${SANS};font-size:14px;color:${T.muted};line-height:1.62;">
        Can this token be frozen? Could you actually sell it? Did that payment arrive in full?
        NOSHASHI answers from the live ledger and gives you a receipt for the decision.
      </p>`, { accent: T.ink })}
    ${para("The app is free, and you don't need an account to try it.")}
    ${button("Download the app", `${SITE}/#download`)}
    <p style="margin:18px 0 0;font-family:${MONO};font-size:10.5px;letter-spacing:.12em;color:${T.faint};">
      FREE &nbsp;&middot;&nbsp; MACOS, WINDOWS, LINUX &nbsp;&middot;&nbsp; READ-ONLY, NEVER HOLDS YOUR KEYS</p>`;

  return {
    subject: "NOSHASHI — you're subscribed",
    html: shell({
      title: "You're subscribed",
      kicker: "Subscribed",
      preheader: "You'll get an email when we ship something new or find an XRPL risk worth knowing about.",
      body,
      unsubscribeUrl,
    }),
  };
}

/** A product update, built from mission-log entries. */
export function updateEmail({ entries, headline: title, intro, unsubscribeUrl } = {}) {
  const rows = (entries || []).slice(0, 6).map((e, i) => logEntry(e, i)).join("");
  const body = `
    ${eyebrow("Product update")}
    ${headline(title || "What shipped")}
    ${intro ? para(intro) : ""}
    <div style="margin:8px 0 0;">${rows || `<p style="margin:0 0 20px;font-family:${SANS};font-size:14px;color:${T.faint};">
      No entries in this period.</p>`}</div>
    <div style="border-top:1px solid ${T.rule};height:1px;line-height:1px;font-size:0;">&nbsp;</div>
    ${button("Open the full log", `${SITE}/status/`)}`;

  return {
    subject: title ? `NOSHASHI — ${title}` : "NOSHASHI — product update",
    html: shell({
      title: title || "Product update",
      kicker: "Product update",
      preheader: intro || "The latest from the NOSHASHI mission log.",
      body,
      unsubscribeUrl,
    }),
  };
}

/** The copy of an enquiry that reaches the team. */
export function enquiryEmail(enquiry) {
  const body = `
    ${eyebrow("New enquiry")}
    ${headline(enquiry.subject || "Website enquiry", { size: 28 })}
    ${panel(facts([["Topic", enquiry.topic], ["Name", enquiry.name], ["Email", enquiry.email], ["Org", enquiry.org], ["Sent", enquiry.at]]))}
    <p style="margin:0 0 8px;font-family:${MONO};font-size:10px;letter-spacing:.14em;color:${T.faint};">MESSAGE</p>
    <p style="margin:0;font-family:${SANS};font-size:15px;color:${T.ink};line-height:1.7;white-space:pre-wrap;">${esc(enquiry.message)}</p>
    <p style="margin:24px 0 0;font-family:${SANS};font-size:12px;color:${T.faint};line-height:1.6;">
      ${enquiry.email ? `Replying to this email goes straight to ${esc(enquiry.email)}.` : "Sent without an email address, so there is no one to reply to."}</p>`;

  return {
    subject: `[${enquiry.topic}] ${enquiry.subject || "Website enquiry"}`,
    html: shell({
      title: "New enquiry",
      kicker: "Enquiry",
      preheader: `${enquiry.name} — ${String(enquiry.message).slice(0, 90)}`,
      body,
      footNote: "Sent by the contact form on noshashi.app.",
    }),
  };
}

/**
 * A one-to-one outreach email in the desk's style.
 *
 * Deliberately quieter than the product templates: no call-to-action
 * slab, no panels, no eyebrow. A cold email that arrives looking like a
 * campaign gets read as a campaign. The branding here is the header and
 * the footer; the body is a letter.
 *
 * `paragraphs` is plain text, one string per paragraph. `signoff` is
 * the sender's own name. There is no default, because an outreach email
 * signed by a company rather than a person is the thing this format
 * exists to avoid.
 */
export function outreachEmail({ subject, paragraphs, signoff, note = "" }) {
  const body = `
    ${(paragraphs || []).map((p) => para(p, { tone: "ink" })).join("")}
    <p style="margin:26px 0 0;font-family:${SANS};font-size:15px;color:${T.ink};line-height:1.68;">
      ${esc(signoff || "")}</p>
    <p style="margin:4px 0 0;font-family:${SANS};font-size:13.5px;color:${T.muted};line-height:1.6;">
      NOSHASHI &nbsp;&middot;&nbsp;
      <a href="${SITE}/" style="color:${T.ink};text-decoration:underline;">noshashi.app</a></p>
    ${note ? `<p style="margin:20px 0 0;font-family:${MONO};font-size:10.5px;letter-spacing:.12em;
      color:${T.faint};line-height:1.7;">${esc(note)}</p>` : ""}`;

  return {
    subject,
    html: shell({
      title: subject,
      kicker: "Letter",
      preheader: (paragraphs && paragraphs[0]) ? String(paragraphs[0]).slice(0, 110) : subject,
      body,
      footNote: "Sent individually, not as part of a campaign. Reply and it reaches a person.",
    }),
  };
}
