/*
 * Branded HTML email.
 *
 * The site's design language, rebuilt under email's constraints — which
 * are not the web's and are worth stating, because most "branded email"
 * breaks on exactly these:
 *
 *   - Layout is tables. Flex and grid are unsupported in Outlook's Word
 *     rendering engine, which is still a large share of institutional
 *     inboxes, and that is the audience this product has.
 *   - Styles are inline. Gmail strips <style> blocks in several
 *     contexts, so anything that matters is on the element.
 *   - Web fonts do not load in most clients. Space Grotesk and IBM Plex
 *     Mono are named first and fall back to a system stack; the
 *     typography degrades rather than breaking.
 *   - Every cell states its own background and colour. A client that
 *     forces its own theme will otherwise paint dark text on our dark
 *     ground, which is unreadable and invisible in testing.
 *   - The width is 600px, the widest that survives a phone without
 *     horizontal scroll.
 *
 * Colours are DESIGN.md's tokens, hard-coded because email has no
 * custom properties.
 */

import { esc, attrUrl } from "./html.js";

export const T = {
  ground: "#0B0F14",
  surface: "#11161D",
  elevated: "#1C2330",
  ink: "#E6E8EB",
  muted: "#A3A8B3",
  faint: "#747C8B",
  rule: "#2A313C",
  brand: "#3A82F6",
  tele: "#00E0C6",
  go: "#35D49A",
  hold: "#F5B942",
  nogo: "#FF5F6D",
};

const SANS = "'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SITE = "https://www.noshashi.app";

/*
 * The mark, as a hosted transparent PNG.
 *
 * It was an inline <svg>, which was a real bug: Gmail, Outlook and
 * Yahoo all strip SVG from email bodies, so the logo rendered as
 * nothing in most of the inboxes it was sent to — and looked correct in
 * every browser-based preview, which is why it survived being written.
 *
 * Fully transparent, with nothing painted behind it. The cell carried
 * an explicit navy for a while to guard one case: the mark is white, so
 * against a white ground it does not merely degrade, it disappears. A
 * client that forces its own light theme shows an empty space where the
 * logo should be. That guard is gone at the product owner's direction —
 * the logo now sits on whatever the client paints, which is what keeps
 * it clean on every dark client and is the common case by a wide
 * margin.
 *
 * If it ever reads as missing in a real inbox, the fix is a dark-ink
 * variant swapped on `prefers-color-scheme`, which some clients honour —
 * not repainting a box behind this one.
 *
 * Served at 240px, displayed at 64. `alt` matters more than usual:
 * many clients block images by default, and the alt is then the logo.
 */
const MARK_URL = `${SITE}/assets/email-mark.png`;
const MARK = `<img src="${MARK_URL}" width="64" height="64" alt="NOSHASHI"
  style="display:block;border:0;outline:none;text-decoration:none;width:64px;height:64px;">`;

/** A monospace, letter-spaced label — the site's `.eyebrow`. */
export function eyebrow(text) {
  return `<p style="margin:0 0 10px;font-family:${MONO};font-size:10px;letter-spacing:.22em;
    text-transform:uppercase;color:${T.faint};">${esc(text)}</p>`;
}

/** A full-width bordered block, the site's `.panel`. */
export function panel(inner, { accent = null } = {}) {
  const cap = accent
    ? `<tr><td style="height:2px;background:${accent};line-height:2px;font-size:0;">&nbsp;</td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${T.surface};border:1px solid ${T.rule};border-radius:10px;overflow:hidden;margin:0 0 16px;">
    ${cap}
    <tr><td style="padding:22px 24px;">${inner}</td></tr>
  </table>`;
}

/** The one call to action. Bulletproof enough for Outlook. */
export function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;">
    <tr><td style="background:${T.brand};border-radius:10px;">
      <a href="${attrUrl(href)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};
        font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:.02em;">${esc(label)}</a>
    </td></tr></table>`;
}

/** A log entry, matching the site's mission log. */
export function logEntry({ kind, title, body, at, url }) {
  const colour = { release: T.brand, maintenance: T.hold, incident: T.nogo }[kind] || T.faint;
  const date = String(at || "").slice(0, 10);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="margin:0 0 18px;border-left:2px solid ${colour};">
    <tr><td style="padding:2px 0 2px 16px;">
      <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;letter-spacing:.14em;color:${T.faint};">
        ${esc(date)} &nbsp;·&nbsp; <span style="color:${colour};">${esc(String(kind || "note").toUpperCase())}</span>
      </p>
      <p style="margin:0 0 6px;font-family:${SANS};font-size:16px;font-weight:600;color:${T.ink};line-height:1.35;">
        ${esc(title)}</p>
      <p style="margin:0;font-family:${SANS};font-size:13.5px;color:${T.muted};line-height:1.62;">${esc(body)}</p>
      ${url ? `<p style="margin:8px 0 0;"><a href="${attrUrl(url)}" style="font-family:${MONO};font-size:11px;
        letter-spacing:.1em;color:${T.brand};text-decoration:none;">READ MORE &rarr;</a></p>` : ""}
    </td></tr></table>`;
}

/**
 * Wrap body content in the shell.
 *
 * `preheader` is the line a client shows next to the subject in the
 * list view. Left unset, clients scrape the first text they find, which
 * is usually a fragment of the header — so it is always set explicitly.
 */
export function shell({ title, preheader = "", body, unsubscribeUrl = null, footNote = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${T.ground};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">
${esc(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background:${T.ground};padding:32px 16px;">
<tr><td align="center">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
    style="width:600px;max-width:100%;">

    <tr><td style="padding:0 0 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:16px;" valign="middle">${MARK}</td>
        <td valign="middle" style="font-family:${SANS};font-size:17px;font-weight:600;
          letter-spacing:.2em;color:${T.ink};">NOSHASHI</td>
      </tr></table>
    </td></tr>

    <tr><td style="border-top:1px solid ${T.rule};padding:26px 0 0;">${body}</td></tr>

    <tr><td style="border-top:1px solid ${T.rule};padding:22px 0 0;margin-top:26px;">
      <p style="margin:26px 0 10px;font-family:${MONO};font-size:10px;letter-spacing:.14em;color:${T.faint};">
        NOSHASHI LABS &nbsp;·&nbsp; XRPL MAINNET &nbsp;·&nbsp; ALL BUILDS BETA</p>
      <p style="margin:0 0 12px;font-family:${SANS};font-size:12px;color:${T.faint};line-height:1.6;">
        ${footNote || "You are receiving this because you subscribed to product updates at noshashi.app."}
      </p>
      <p style="margin:0;font-family:${SANS};font-size:12px;color:${T.faint};">
        <a href="${SITE}/" style="color:${T.muted};text-decoration:none;">noshashi.app</a>
        &nbsp;·&nbsp;
        <a href="${SITE}/status/" style="color:${T.muted};text-decoration:none;">Status</a>
        &nbsp;·&nbsp;
        <a href="${SITE}/contact/" style="color:${T.muted};text-decoration:none;">Contact</a>
        ${unsubscribeUrl ? `&nbsp;·&nbsp;<a href="${attrUrl(unsubscribeUrl)}"
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
    <h1 style="margin:0 0 16px;font-family:${SANS};font-size:28px;font-weight:700;letter-spacing:-.02em;
      color:${T.ink};line-height:1.2;">You'll hear when something ships.</h1>
    <p style="margin:0 0 18px;font-family:${SANS};font-size:15px;color:${T.muted};line-height:1.65;">
      Not a newsletter. You will get an email when a build ships, when a capability lands, and when
      something is being worked on that affects you &mdash; drawn from the same mission log the site
      publishes, so an email cannot claim something the site does not.
    </p>
    ${panel(`
      ${eyebrow("What NOSHASHI is")}
      <p style="margin:0 0 14px;font-family:${SANS};font-size:14px;color:${T.ink};line-height:1.6;">
        A zero-trust intelligence workstation for the XRP Ledger.</p>
      <p style="margin:0;font-family:${SANS};font-size:13.5px;color:${T.muted};line-height:1.62;">
        It answers two questions about the same position, from the same validated ledger state:
        whether you are allowed to move it, and whether you could actually get out of it.
      </p>`, { accent: T.brand })}
    <p style="margin:0 0 4px;font-family:${SANS};font-size:15px;color:${T.muted};line-height:1.65;">
      The console is free and there is no account to create.
    </p>
    ${button("Download the beta", `${SITE}/#download`)}
    <p style="margin:18px 0 0;font-family:${MONO};font-size:11px;letter-spacing:.1em;color:${T.faint};">
      BETA CHANNEL &nbsp;·&nbsp; UNSIGNED BUILDS &nbsp;·&nbsp; VERIFY THE SHA-256</p>`;

  return {
    subject: "NOSHASHI — you're subscribed",
    html: shell({
      title: "You're subscribed",
      preheader: "You'll get an email when a build ships or a capability lands. Nothing else.",
      body,
      unsubscribeUrl,
    }),
  };
}

/** A product update, built from mission-log entries. */
export function updateEmail({ entries, headline, intro, unsubscribeUrl } = {}) {
  const rows = (entries || []).slice(0, 6).map(logEntry).join("");
  const body = `
    ${eyebrow("Product update")}
    <h1 style="margin:0 0 16px;font-family:${SANS};font-size:26px;font-weight:700;letter-spacing:-.02em;
      color:${T.ink};line-height:1.25;">${esc(headline || "What shipped")}</h1>
    ${intro ? `<p style="margin:0 0 24px;font-family:${SANS};font-size:15px;color:${T.muted};
      line-height:1.65;">${esc(intro)}</p>` : ""}
    ${rows || `<p style="margin:0 0 20px;font-family:${SANS};font-size:14px;color:${T.faint};">
      No entries in this period.</p>`}
    ${button("Open the full log", `${SITE}/status/`)}`;

  return {
    subject: headline ? `NOSHASHI — ${headline}` : "NOSHASHI — product update",
    html: shell({
      title: headline || "Product update",
      preheader: intro || "The latest from the NOSHASHI mission log.",
      body,
      unsubscribeUrl,
    }),
  };
}

/** The copy of an enquiry that reaches the team. */
export function enquiryEmail(enquiry) {
  const row = (k, v) => v
    ? `<tr><td style="padding:6px 16px 6px 0;font-family:${MONO};font-size:10px;letter-spacing:.14em;
         color:${T.faint};white-space:nowrap;vertical-align:top;">${esc(k)}</td>
       <td style="padding:6px 0;font-family:${SANS};font-size:14px;color:${T.ink};">${esc(v)}</td></tr>`
    : "";
  const body = `
    ${eyebrow("New enquiry")}
    <h1 style="margin:0 0 20px;font-family:${SANS};font-size:24px;font-weight:700;letter-spacing:-.02em;
      color:${T.ink};line-height:1.25;">${esc(enquiry.subject || "Website enquiry")}</h1>
    ${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${row("TOPIC", enquiry.topic)}${row("NAME", enquiry.name)}${row("EMAIL", enquiry.email)}
      ${row("ORG", enquiry.org)}${row("SENT", enquiry.at)}
    </table>`)}
    <p style="margin:0 0 8px;font-family:${MONO};font-size:10px;letter-spacing:.14em;color:${T.faint};">MESSAGE</p>
    <p style="margin:0;font-family:${SANS};font-size:15px;color:${T.ink};line-height:1.7;white-space:pre-wrap;">${esc(enquiry.message)}</p>
    <p style="margin:24px 0 0;font-family:${SANS};font-size:12px;color:${T.faint};line-height:1.6;">
      Replying to this email goes straight to ${esc(enquiry.email)}.</p>`;

  return {
    subject: `[${enquiry.topic}] ${enquiry.subject || "Website enquiry"}`,
    html: shell({
      title: "New enquiry",
      preheader: `${enquiry.name} — ${String(enquiry.message).slice(0, 90)}`,
      body,
      footNote: "Sent by the contact form on noshashi.app.",
    }),
  };
}

/**
 * A one-to-one outreach email in the site's design.
 *
 * Deliberately quieter than the product templates: no call-to-action
 * slab, no panels, no eyebrow. A cold email that arrives looking like a
 * campaign gets read as a campaign. The branding here is the header and
 * the footer; the body is a letter.
 *
 * `paragraphs` is plain text, one string per paragraph. `signoff` is
 * the sender's own name — there is no default, because an outreach
 * email signed by a company rather than a person is the thing this
 * format exists to avoid.
 */
export function outreachEmail({ subject, paragraphs, signoff, note = "" }) {
  const body = `
    ${(paragraphs || []).map((p) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;
      color:${T.ink};line-height:1.68;">${esc(p)}</p>`).join("")}
    <p style="margin:26px 0 0;font-family:${SANS};font-size:15px;color:${T.ink};line-height:1.68;">
      ${esc(signoff || "")}</p>
    <p style="margin:4px 0 0;font-family:${SANS};font-size:13.5px;color:${T.muted};line-height:1.6;">
      NOSHASHI Labs &nbsp;·&nbsp;
      <a href="${SITE}/" style="color:${T.brand};text-decoration:none;">noshashi.app</a></p>
    ${note ? `<p style="margin:20px 0 0;font-family:${MONO};font-size:10.5px;letter-spacing:.12em;
      color:${T.faint};line-height:1.7;">${esc(note)}</p>` : ""}`;

  return {
    subject,
    html: shell({
      title: subject,
      preheader: (paragraphs && paragraphs[0]) ? String(paragraphs[0]).slice(0, 110) : subject,
      body,
      footNote: "Sent individually, not as part of a campaign. Reply and it reaches a person.",
    }),
  };
}
