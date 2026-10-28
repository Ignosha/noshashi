/*
 * /academy/ and /academy/certificate/: NOSHASHI Academy on the website.
 *
 * The Academy is a separate app (academy/). Its course content is
 * src/lib/academy/course.json, read here too, so the page lists exactly the
 * lessons the app teaches. The app itself runs in the browser at
 * /academy/app/ (built by `npm run site:academy`) and as a desktop app.
 *
 * /academy/certificate/ re-checks a certificate of completion: the link
 * carries what the certificate states, and the page recomputes its SHA-256
 * code in the browser. Nothing is sent or stored.
 */
import { readFileSync } from "node:fs";
import { renderPage, breadcrumb } from "../api/_lib/shell.js";
import { esc } from "../api/_lib/html.js";

const COURSE = JSON.parse(readFileSync(new URL("../src/lib/academy/course.json", import.meta.url), "utf8"));
const VERSION = JSON.parse(readFileSync(new URL("../academy/src-tauri/tauri.conf.json", import.meta.url), "utf8")).version;
const TESTNET = JSON.parse(readFileSync(new URL("../src/lib/academy/testnet-cases.json", import.meta.url), "utf8"));
const LABS = (readFileSync(new URL("../src/lib/learn/labs.ts", import.meta.url), "utf8").match(/^    id: "/gm) ?? []).length + 1;

/**
 * Set once a release tagged academy-v<version> is published (Actions ›
 * Academy › Run workflow with publish). Until then the page offers the
 * browser version and says the installers are coming, rather than linking
 * to a release that does not exist.
 */
const DESKTOP_RELEASED = true;
const RELEASE_URL = `https://github.com/Ignosha/noshashi/releases/tag/academy-v${VERSION}`;

export async function buildAcademy(write) {
  const minutes = COURSE.lessons.reduce((n, l) => n + l.minutes, 0);
  const levels = COURSE.levels
    .map((level) => {
      const lessons = COURSE.lessons.filter((l) => l.level === level.id);
      return `<section class="ac-level">
  <h3>Level ${level.n} · ${esc(level.title)}</h3>
  <p>${esc(level.blurb)}</p>
  <ol>${lessons
    .map((l) => `<li><span>${esc(l.title)}</span><span class="ac-meta">${l.minutes} min${l.video ? " · video" : ""}${l.labs.length ? " · lab" : ""}</span></li>`)
    .join("")}</ol>
</section>`;
    })
    .join("\n");

  const download = DESKTOP_RELEASED
    ? `<a class="btn ghost" href="${RELEASE_URL}" rel="noopener">Download for Mac, Windows or Linux</a>`
    : `<span class="ac-soon">Desktop installers for Mac, Windows and Linux come with the first Academy release.</span>`;

  const body = `<div class="ac-wrap">
<section class="ac-hero">
  <p class="eyebrow">NOSHASHI ACADEMY · FREE</p>
  <h1>Learn NOSHASHI and the XRP Ledger, one small step at a time.</h1>
  <p>${COURSE.lessons.length} short lessons in ${COURSE.levels.length} levels, about ${minutes} minutes in all. Videos with captions, every card read aloud if you like, a three-question check after each lesson, hands-on labs in a lab workstation running the real NOSHASHI console, and a certificate of completion.</p>
  <p class="cta"><a class="btn" href="/academy/app/">Start in your browser</a> ${download}</p>
  <p class="ac-fine"><strong>On iPhone or iPad:</strong> open <a href="/academy/app/">the Academy</a> in Safari, tap Share, then Add to Home Screen. It gets its own icon and opens full screen, like an app.</p>
  <p class="ac-fine">No account, no sign-in, no keys. Your progress stays on your own computer. Works offline: the desktop app carries everything, videos included; in the browser the course keeps working offline after your first visit, and only the videos need a connection. Offline, labs show their recorded ledger readings.</p>
</section>

<section class="ac-grid" aria-label="How the Academy is built">
  <div><h2>Learn the way you learn</h2><p>Choose watch, listen, read or do. Each lesson starts with that, and nothing is hidden for any style.</p></div>
  <div><h2>Short enough to finish</h2><p>One idea per card, one question at a time, a progress line that always shows how close the end is, and no timers.</p></div>
  <div><h2>Built for everyone</h2><p>Larger text, more spacing, Atkinson Hyperlegible letters for low vision, high contrast, no movement, read-aloud, captions and transcripts, full keyboard use, and break reminders.</p></div>
  <div><h2>A lab workstation, like Packet Tracer</h2><p>${LABS} labs, one for every NOSHASHI feature, run in the lab workstation: the real NOSHASHI console inside the Academy, beside each step's instructions, with objectives that tick off as you do them and CHECK RESULTS to score them. Real mainnet addresses, plus ${TESTNET.cases.length} real testnet payments to check against invoices. No NOSHASHI install needed.</p></div>
</section>

<section class="ac-course">
  <h2>The course</h2>
  ${levels}
  <section class="ac-level">
    <h3>Final check and certificate</h3>
    <p>${COURSE.exam.questions} questions from the whole course, ${COURSE.exam.passPercent}% to pass, as many tries as you need. Pass every lesson and the final check for a certificate of completion with a code anyone can <a href="/academy/certificate/">check here</a>.</p>
  </section>
</section>

<p class="ac-fine">The certificate is a record of a completed self-paced course. It is not a professional licence, an accreditation, a regulatory qualification or an offer of employment. The full written course is also on the <a href="/learn/">Learn</a> page.</p>
</div>`;

  await write(
    "academy/index.html",
    renderPage({
      title: "NOSHASHI Academy · Learn NOSHASHI and the XRP Ledger",
      description: `A free, self-paced course: ${COURSE.lessons.length} short lessons, videos, read-aloud, checks, labs on the real XRP Ledger and a certificate of completion.`,
      path: "/academy/",
      current: "resources",
      head: `<link rel="stylesheet" href="/assets/academy.css">`,
      body,
      structured: [breadcrumb("NOSHASHI Academy", "/academy/")],
    })
  );

  const verify = `<div class="ac-wrap">
<section class="ac-hero">
  <p class="eyebrow">NOSHASHI ACADEMY</p>
  <h1>Check a certificate of completion</h1>
  <p>Open the check link from a certificate. This page recomputes the certificate's code from what it states, in your browser. Nothing is sent or stored.</p>
</section>
<section id="ac-result" class="ac-result" aria-live="polite"><p>No certificate link was opened. A certificate's check link ends in a long code after a # sign.</p></section>
</div>`;

  await write(
    "academy/certificate/index.html",
    renderPage({
      title: "Check a certificate · NOSHASHI Academy",
      description: "Recompute a NOSHASHI Academy certificate's code from what it states. Runs in your browser; nothing is sent.",
      path: "/academy/certificate/",
      current: "resources",
      head: `<link rel="stylesheet" href="/assets/academy.css">`,
      body: verify,
      scripts: `<script src="/assets/academy-certificate.js" defer></script>`,
      structured: [breadcrumb("Check a certificate", "/academy/certificate/")],
    })
  );
}

export const ACADEMY_PAGES = [
  ["/academy/", "monthly", "0.8"],
  ["/academy/certificate/", "yearly", "0.3"],
];
