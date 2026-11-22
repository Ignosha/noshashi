#!/usr/bin/env node
/*
 * Render one outreach letter in the Ledger Desk style, for sending
 * through Gmail (send_message / reply take `htmlBody` and `body`).
 *
 *   node scripts/outreach-email.mjs letter.json            # prints { subject, html, text } as JSON
 *   node scripts/outreach-email.mjs letter.json --preview out.html
 *
 * letter.json:
 *   { "subject": "...", "paragraphs": ["...", "..."], "signoff": "Joshua Edmond" }
 *
 * The postal address and the opt-out line are filled in here, from the
 * outreach rules, so no letter can go out without them. The address is
 * read from OUTREACH_POSTAL_ADDRESS rather than kept in the repository;
 * without it the script refuses to render. The logo is
 * left out because Gmail's API removes hosted images; the serif
 * wordmark carries the header instead.
 */

import { readFile, writeFile } from "node:fs/promises";
import { outreachEmail } from "../api/_lib/email.js";

export const OPT_OUT = "If you'd rather not hear from me, reply \"no\" and I won't write again.";

export function renderLetter({ subject, paragraphs, signoff, role, note }, postalAddress = process.env.OUTREACH_POSTAL_ADDRESS) {
  if (!postalAddress || !postalAddress.trim()) throw new Error("OUTREACH_POSTAL_ADDRESS is not set: every outreach email must carry a postal address");
  if (!subject || !Array.isArray(paragraphs) || !paragraphs.length) throw new Error("subject and paragraphs are required");
  if (!signoff) throw new Error("signoff (the sender's own name) is required");
  return outreachEmail({ subject, paragraphs, signoff, role, note, postalAddress: postalAddress.trim(), optOut: OPT_OUT, mark: false });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/outreach-email.mjs letter.json [--preview out.html]");
    process.exit(1);
  }
  const mail = renderLetter(JSON.parse(await readFile(file, "utf8")));
  const i = process.argv.indexOf("--preview");
  if (i > -1 && process.argv[i + 1]) await writeFile(process.argv[i + 1], mail.html, "utf8");
  process.stdout.write(JSON.stringify(mail));
}
