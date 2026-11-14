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
const RELEASE_CATALOG = JSON.parse(readFileSync(new URL("../academy/release-catalog.json", import.meta.url), "utf8"));
const DESKTOP_RELEASED = !!RELEASE_CATALOG.academy;
const RELEASE_URL = RELEASE_CATALOG.academy?.url ?? "https://github.com/Ignosha/noshashi/releases";
const ARROW = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3h10v10M3 13 13 3" stroke="currentColor" stroke-width="1.2"/></svg>';

export async function buildAcademy(write) {
  const minutes = COURSE.lessons.reduce((n, l) => n + l.minutes, 0);
  const levels = COURSE.levels
    .map((level) => {
      const lessons = COURSE.lessons.filter((l) => l.level === level.id);
      return `<details class="ac-level"${level.n === 1 ? " open" : ""}>
  <summary><h3><span class="ac-index">${String(level.n).padStart(2, "0")}</span>${esc(level.title)}</h3><span class="ac-meta">${lessons.length} lessons · ${lessons.reduce((n, l) => n + l.minutes, 0)} min</span></summary>
  <p>${esc(level.blurb)}</p>
  <ol>${lessons
    .map((l) => `<li><span>${esc(l.title)}</span><span class="ac-meta">${l.minutes} min${l.video ? " · video" : ""}${l.labs.length ? " · lab" : ""}</span></li>`)
    .join("")}</ol>
</details>`;
    })
    .join("\n");

  const download = DESKTOP_RELEASED
    ? `<a class="btn ghost" href="${RELEASE_URL}" rel="noopener">Review published Academy downloads</a>`
    : `<span class="ac-soon">Desktop installers for Mac, Windows and Linux come with the first Academy release.</span>`;

  const body = `<div class="ac-wrap">
<section class="ac-hero">
  <div class="ac-hero-copy">
    <p class="eyebrow">THE LEARNING DESK / FREE, SELF-PACED</p>
    <p class="ac-brand-name">Noshashi <em>Academy</em></p>
    <h1>Learn the ledger.<br><em>Read the evidence.</em></h1>
    <p class="ac-lead">Understand issuer controls, delivered payments and funded order-book depth. Build the judgement to ask better questions of public XRPL evidence.</p>
    <p class="cta"><a class="btn" href="/academy/app/?lesson=a1">Start the 5-minute lesson ${ARROW}</a> ${download}</p><p class="cta"><a class="btn ghost" href="/academy/app/?case=invoice">Try one payment lab ${ARROW}</a><a href="/academy/app/">Continue where you left off</a></p>
    <p class="ac-fine">No account. No wallet keys. Your progress stays on your device. Short spaced reviews, explicit answer checks and a separate 25-question practice test.</p>
  </div>
  <aside class="ac-fieldnotes" aria-label="From a lesson to an investigation">
    <p class="eyebrow">FIELD GUIDE / HOW IT WORKS</p>
    <ol>
      <li><span>01</span><div><h2>Understand the idea.</h2><p>Watch, listen or read. One clear concept at a time.</p></div></li>
      <li><span>02</span><div><h2>Examine the evidence.</h2><p>Put the concept to work in the NOSHASHI lab workstation.</p></div></li>
      <li><span>03</span><div><h2>Check your understanding.</h2><p>Retry a short check, then move on at your own pace.</p></div></li>
    </ol>
    <p class="ac-fieldnotes-end">Short recall sessions. Optional timers. No streak penalties. Your place stays saved.</p>
  </aside>
</section>

<dl class="ac-facts" aria-label="Course at a glance">
  <div><dt>Short lessons</dt><dd>${COURSE.lessons.length}</dd></div>
  <div><dt>Learning levels</dt><dd>${COURSE.levels.length}</dd></div>
  <div><dt>At your own pace</dt><dd>~${minutes}<small> min</small></dd></div>
  <div><dt>Cost to learn</dt><dd class="ac-fact-word">Always free</dd></div>
</dl>

<section class="ac-grid" aria-label="Learn to read public ledger evidence">
  <div><p class="eyebrow">01 / ISSUER CONTROLS</p><h2>Who holds the controls?</h2><p>Read freeze, clawback and authorization settings. Learn what those flags can establish, and what they cannot prove about reserves or legal rights.</p></div>
  <div><p class="eyebrow">02 / PAYMENT EVIDENCE</p><h2>What was delivered?</h2><p>Examine the delivered amount, understand partial payments, and recognize when the evidence is incomplete.</p></div>
  <div><p class="eyebrow">03 / FUNDED DEPTH</p><h2>What depth is funded?</h2><p>Distinguish quoted offers from funded order-book depth. A snapshot is evidence at a point in time, not an execution guarantee.</p></div>
</section>

<section class="ac-course">
  <p class="eyebrow">YOUR COURSE / FROM FIRST PRINCIPLES TO PRACTICE</p>
  <h2>Build your understanding,<br><em>one chapter at a time.</em></h2>
  ${levels}
  <section class="ac-level">
    <h3>Final check and certificate</h3>
    <p>${COURSE.exam.questions} questions from the whole course, ${COURSE.exam.passPercent}% to pass, as many tries as you need. Pass every lesson and the final check for a certificate of completion with a code anyone can <a href="/academy/certificate/">check here</a>.</p>
  </section>
</section>

<section class="ac-reading" aria-labelledby="ac-reading-title">
  <div><p class="eyebrow">A COURSE THAT WORKS FOR YOU</p><h2 id="ac-reading-title">Your pace.<br><em>Your way of learning.</em></h2></div>
  <div><p>Choose watch, listen, read or do. Captions, transcripts, read-aloud, larger text, Atkinson Hyperlegible, high contrast, reduced movement and break reminders are available in the course.</p><p>${LABS} workstation labs and four versioned analyst cases: recorded training evidence stays usable during live-node outages. The workstation labs run the NOSHASHI training console beside their instructions, with recorded mainnet examples and ${TESTNET.cases.length} testnet payment cases. No separate NOSHASHI installation is needed.</p><p>Course content: academy-retention/1. Published desktop downloads are separate and may use earlier course content. Signing and physical OS compatibility are not established by download availability.</p><p>After a first browser visit, lessons and checks work offline; videos and fresh ledger readings need a connection. The desktop app bundles the videos. <strong>On iPhone or iPad:</strong> open the Academy in Safari, then Share → Add to Home Screen.</p></div>
</section>

<div class="ac-next"><div><p class="eyebrow">THE NEXT STEP IS A SMALL ONE</p><h2>Open your learning desk.</h2></div><a class="btn" href="/academy/app/?lesson=a1">Start the 5-minute lesson ${ARROW}</a></div>
<p class="ac-fine">The certificate records completion of a self-paced course; it is not a professional licence, accreditation or regulatory qualification. Its check code is a hash of the stated information, not a digital signature or independent proof of completion. The full written course is also on the <a href="/learn/">Learn</a> page.</p>
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
