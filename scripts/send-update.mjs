#!/usr/bin/env node
/*
 * Send a product update to the subscriber list.
 *
 *   node scripts/send-update.mjs --headline "v0.4.0 is out" [--since 2026-09-01]
 *   node scripts/send-update.mjs --headline "..." --send        # actually sends
 *
 * Without --send it renders the email, writes it to /private/tmp and
 * prints what it would do. That default is deliberate: a broadcast
 * cannot be recalled, and the version of this script that sends by
 * default is the version that eventually sends a draft.
 *
 * The body is built from the mission log — repository notices merged
 * with the GitHub releases feed — which means an email cannot announce
 * something the site does not already say. Add the entry to
 * site/data/updates.json, deploy, then send.
 *
 * Automatic mode, for CI (.github/workflows/send-update.yml):
 *
 *   node scripts/send-update.mjs --auto --base <sha> [--send]
 *
 * sends only the entries added to site/data/updates.json since commit
 * <sha>: releases, milestones and notes. Maintenance windows and
 * incidents stay on the status page; they are not news to a subscriber
 * list. No new entry, no email.
 *
 * Needs RESEND_API_KEY and RESEND_AUDIENCE_ID in the environment.
 */

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getProjectFeed } from "../api/_lib/project-feed.js";
import { updateEmail } from "../api/_lib/email.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.resend.com";
const SITE = "https://www.noshashi.app";
/** Entry kinds that become an email. */
export const NEWS_KINDS = new Set(["release", "milestone", "note"]);

/**
 * Entries in `now` that are not in `before` (matched on date and title),
 * news kinds only, newest first, shaped for updateEmail().
 */
export function newEntries(before, now) {
  const seen = new Set((Array.isArray(before) ? before : []).map((e) => `${e?.date}|${e?.title}`));
  return (Array.isArray(now) ? now : [])
    .filter((e) => e && !seen.has(`${e.date}|${e.title}`) && NEWS_KINDS.has(e.kind) && Number.isFinite(Date.parse(e.date)) && e.title)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .map((e) => ({
      kind: e.kind,
      title: String(e.title),
      body: String(e.body || ""),
      at: new Date(Date.parse(e.date)).toISOString(),
      url: typeof e.link === "string" && e.link ? (e.link.startsWith("/") ? `${SITE}${e.link}` : e.link) : "",
    }));
}

function updatesAt(sha) {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error(`--base is not a commit: ${sha}`);
  try {
    return JSON.parse(execFileSync("git", ["show", `${sha}:site/data/updates.json`], { cwd: ROOT, encoding: "utf8" }));
  } catch {
    return []; // the file did not exist at that commit: everything in it is new
  }
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const FLAG = (name) => process.argv.includes(`--${name}`);

async function main() {
  if (FLAG("auto")) return send(await autoMail());
  const headline = arg("headline");
  if (!headline) {
    console.error('A headline is required:  --headline "v0.4.0 is out"');
    process.exit(1);
  }
  const intro = arg("intro",
    "Everything below is in the public mission log, so this email cannot claim something the site does not.");
  const since = arg("since");

  const feed = await getProjectFeed({ limit: 30, root: ROOT });
  let entries = feed.entries;
  if (since) {
    const cutoff = Date.parse(since);
    if (!Number.isFinite(cutoff)) throw new Error(`--since is not a date: ${since}`);
    entries = entries.filter((e) => Date.parse(e.at) >= cutoff);
  }
  entries = entries.slice(0, 6);

  if (!entries.length) {
    console.error("No log entries to send. Add one to site/data/updates.json first.");
    process.exit(1);
  }

  const mail = updateEmail({
    entries,
    headline,
    intro,
    // Resend substitutes this per recipient on a broadcast.
    unsubscribeUrl: "{{{RESEND_UNSUBSCRIBE_URL}}}",
  });
  return send({ mail, entries });
}

/** The email for the entries added since --base, or null when there are none. */
async function autoMail() {
  const base = arg("base");
  if (!base) throw new Error("--auto needs --base <sha>");
  const now = JSON.parse(await readFile(path.join(ROOT, "site", "data", "updates.json"), "utf8"));
  const entries = newEntries(updatesAt(base), now).slice(0, 6);
  if (!entries.length) return null;
  const headline = entries.length === 1 ? entries[0].title : `${entries.length} new updates`;
  const mail = updateEmail({
    entries,
    headline,
    intro: "Everything below is in the public mission log, so this email cannot claim something the site does not.",
    unsubscribeUrl: "{{{RESEND_UNSUBSCRIBE_URL}}}",
  });
  return { mail, entries };
}

async function send(built) {
  if (!built) {
    console.log("No new release, milestone or note in the mission log. Nothing to send.");
    return;
  }
  const { mail, entries } = built;
  const preview = path.join(os.tmpdir(), "noshashi-update-preview.html");
  await writeFile(preview, mail.html, "utf8");

  console.log(`subject:  ${mail.subject}`);
  console.log(`entries:  ${entries.length}`);
  for (const e of entries) console.log(`  · ${e.at.slice(0, 10)}  ${e.kind.padEnd(11)} ${e.title}`);
  console.log(`preview:  ${preview}`);

  if (!FLAG("send")) {
    console.log("\nDRY RUN — nothing sent. Open the preview, then re-run with --send.");
    return;
  }

  const key = process.env.RESEND_API_KEY;
  const audience = process.env.RESEND_AUDIENCE_ID;
  if (!key || !audience) {
    console.error("\nRESEND_API_KEY and RESEND_AUDIENCE_ID must both be set to send.");
    process.exit(1);
  }

  const from = process.env.CONTACT_FROM || "NOSHASHI <noreply@noshashi.app>";

  // Created as a broadcast, then sent as a separate call. Resend needs
  // both, and the split means a creation failure never half-sends.
  const created = await fetch(`${API}/broadcasts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ audience_id: audience, from, subject: mail.subject, html: mail.html }),
  });
  const draft = await created.json().catch(() => ({}));
  if (!created.ok || !draft?.id) {
    console.error("Broadcast could not be created:", created.status, draft?.message || draft);
    process.exit(1);
  }

  const sent = await fetch(`${API}/broadcasts/${draft.id}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!sent.ok) {
    const detail = await sent.json().catch(() => ({}));
    console.error(`Broadcast ${draft.id} was created but NOT sent:`, sent.status, detail?.message || detail);
    console.error("It is a draft in the Resend dashboard — send or delete it there.");
    process.exit(1);
  }

  console.log(`\nSENT — broadcast ${draft.id}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("send-update failed:", error.message);
    process.exit(1);
  });
}
