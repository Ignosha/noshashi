/*
 * /tutorial/: every screen in the desktop app, in the order of its
 * sidebar, with what it answers, how to use it, and the plan it needs.
 *
 * Screen names are the app's own labels (src/App.tsx SCENES), and each
 * plan is the one the app's gate asks for (src/lib/billing/catalog.ts:
 * "desk" is sold as Pro). Screenshots are real: captured from the app on
 * live mainnet by scripts/capture-app-shots.mjs, with the ledger they
 * were read at in the caption. A screen without one is shown without a
 * picture rather than with a mockup.
 */
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderPage, breadcrumb } from "../api/_lib/shell.js";
import { esc } from "../api/_lib/html.js";

// The content is shared with the desktop app's own guide and tour
// (src/components/nova/Guide.tsx), so the two can never disagree.
// Steps use **bold** and `key` marks; html() turns them into markup.
const CONTENT = JSON.parse(readFileSync(new URL("../src/lib/tutorial/screens.json", import.meta.url), "utf8"));
const FREE = "Free";
const PRO = "Pro";
const INST = "Institutional";
const ENT = "Enterprise";
const html = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<kbd>$1</kbd>");

// [app label, plan, what it answers, steps (markup), screenshot name, more link]
export const GROUPS = CONTENT.groups.map((g) => [g.id, g.title, g.intro,
  g.screens.map((f) => [f.label, f.plan, f.answers, f.steps.map(html), f.shot, f.more])]);

const PLAN_CLASS = { [FREE]: "free", [PRO]: "pro", [INST]: "inst", [ENT]: "ent" };
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function shotFigure(manifest, name) {
  const shot = manifest?.shots?.find((s) => s.name === name);
  if (!shot) return "";
  const when = shot.captured_at ? new Date(shot.captured_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
  const where = shot.ledger ? `ledger ${shot.ledger.toLocaleString("en-US")}` : "XRPL mainnet";
  return `<figure class="tu-shot">
        <img src="/assets/shots/${name}.webp" srcset="/assets/shots/${name}.webp 1440w, /assets/shots/${name}@2x.webp 2880w" sizes="(min-width:1100px) 760px, 100vw"
          width="1440" height="900" alt="${esc(shot.alt)}" loading="lazy" decoding="async">
        <figcaption>Live on XRPL mainnet · ${esc(where)}${when ? ` · ${esc(when)}` : ""}</figcaption>
      </figure>`;
}

function feature(manifest, [label, plan, answers, steps, shot, more]) {
  return `<article class="tu-feature" id="screen-${slug(label)}">
      <div class="tu-fhead"><h3>${esc(label)}</h3><span class="tu-plan ${PLAN_CLASS[plan]}">${plan}</span></div>
      <p class="tu-answers">${esc(answers)}</p>
      <ol class="tu-steps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
      ${more ? `<p class="tu-more"><a href="${more}">Full walkthrough &rarr;</a></p>` : ""}
      ${shot ? shotFigure(manifest, shot) : ""}
    </article>`;
}

export async function buildTutorial(write, { site }) {
  const manifest = JSON.parse(await readFile(path.join(site, "assets/shots/manifest.json"), "utf8").catch(() => "null"));
  const count = GROUPS.reduce((n, g) => n + g[3].length, 0);
  const free = GROUPS.reduce((n, g) => n + g[3].filter((f) => f[1] === FREE).length, 0);

  const toc = `<nav class="tu-toc" aria-label="On this page">
    <p class="tu-toc-h">On this page</p>
    <ol>
      <li><a href="#start">Get started</a></li>
      <li><a href="#first-check">Your first check</a></li>
      ${GROUPS.map(([id, title]) => `<li><a href="#${id}">${esc(title)}</a></li>`).join("\n      ")}
      <li><a href="#keys">Shortcuts</a></li>
      <li><a href="#questions">Questions</a></li>
    </ol>
  </nav>`;

  const body = `<div class="tu-hero">
  <p class="eyebrow">Desktop app tutorial</p>
  <h1>Learn NOSHASHI in ten minutes.</h1>
  <p>Every screen in the app, what it answers, and how to use it in three steps. ${free} of the ${count} screens are free.</p>
  <p class="cta"><a class="btn" href="/#download">Download the app</a><a class="btn ghost" href="/app/">Try it in the browser</a></p>
</div>

<div class="tu-layout">
  ${toc}
  <div class="tu-body">

  <section id="start" class="tu-section">
    <h2>Get started</h2>
    <ol class="tu-cards">
      <li><b>Install it.</b> Download for macOS, Windows or Linux. The builds are not code-signed yet. On a Mac, right-click the app and choose <b>Open</b> the first time. On Windows, choose <b>More info</b> then <b>Run anyway</b>.</li>
      <li><b>Press Get started.</b> The app connects to the XRP Ledger. The top bar reads <b>ONLINE</b> when it is live.</li>
      <li><b>Pick a view.</b> <b>Executive</b> shows the eight key screens. <b>Analyst</b> shows every tool. Switch any time at the top of the sidebar.</li>
      <li><b>Jump anywhere.</b> Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> and type a screen, a wallet or a command.</li>
    </ol>
    <p class="tu-note">NOSHASHI only reads the ledger. It never asks for a private key or seed phrase, and it never signs anything.</p>
  </section>

  <section id="first-check" class="tu-section">
    <h2>Your first check</h2>
    <p class="tu-lede">Find out whether a payment can go ahead, before anyone signs it.</p>
    <ol class="tu-steps big">
      <li>Open <b>Verification</b> in the sidebar.</li>
      <li>Paste the account you would pay into <b>Destination account</b>.</li>
      <li>Enter the amount in XRP, or tap 100, 1,000, 25,000 or 500,000.</li>
      <li>Pick a rule profile under <b>Rule profile</b>. Each one lists the credentials it requires.</li>
      <li>Press <b>Run compliance gate</b>.</li>
    </ol>
    ${shotFigure(manifest, "verification")}
    <div class="tu-verdicts">
      <div><span class="t-go">GO</span><p>Every blocking rule passed.</p></div>
      <div><span class="t-hold">HOLD</span><p>Blocking rules passed, but an advisory rule failed. Someone should sign it off.</p></div>
      <div><span class="t-nogo">NO-GO</span><p>A blocking rule failed. Do not send it.</p></div>
    </div>
    <p>Under the verdict, each rule shows <b>Pass</b> or <b>Fail</b> with the reason. The <b>cryptographic receipt</b> (SHA-256) proves which facts and rules produced the result. Every run is kept in the <b>Session log</b>.</p>
  </section>

  ${GROUPS.map(([id, title, intro, features]) => `<section id="${id}" class="tu-section">
    <h2>${esc(title)}</h2>
    <p class="tu-lede">${esc(intro)}</p>
    ${features.map((f) => feature(manifest, f)).join("\n    ")}
  </section>`).join("\n\n  ")}

  <section id="keys" class="tu-section">
    <h2>Shortcuts</h2>
    <table class="tu-keys">
      <tbody>
        <tr><th scope="row"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd></th><td>Search screens, wallets and commands</td></tr>
        <tr><th scope="row"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd></th><td>Run the compliance gate on Verification</td></tr>
        <tr><th scope="row"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>1</kbd>…<kbd>9</kbd></th><td>Jump to a screen</td></tr>
        <tr><th scope="row"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>R</kbd></th><td>Re-read the ledger</td></tr>
        <tr><th scope="row"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd></th><td>Show or hide the menu bar HUD</td></tr>
      </tbody>
    </table>
  </section>

  <section id="questions" class="tu-section">
    <h2>Questions</h2>
    <details><summary>Do I need a wallet, a key or an account?</summary><p>No. The app reads public ledger data. It never asks for a private key or seed phrase and never signs. An account is only needed to carry a paid plan, portfolios or API keys.</p></details>
    <details><summary>What does a screen marked Pro, Institutional or Enterprise do if I am on Free?</summary><p>It shows what it does and offers <b>Sign in</b> or <b>See plans</b>. Nothing is hidden behind a fake preview. Prices are on the <a href="/pricing/">pricing page</a>.</p></details>
    <details><summary>The top bar says DEGRADED or RECONNECTING.</summary><p>DEGRADED means one public node is behind the others. It usually clears within a few ledgers. RECONNECTING means the link dropped, and nothing is shown as live until it is back. Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>R</kbd> to re-read.</p></details>
    <details><summary>Where is my data kept?</summary><p>Verdicts, policies and settings stay on your device. The <b>Trust &amp; Security</b> screen lists exactly what is read and where anything goes.</p></details>
    <details><summary>I am stuck.</summary><p>Open <b>NOSHX</b> and use the <b>Support</b> tab, or <a href="/contact/">contact us</a>. The <b>Learn</b> screen has hands-on labs for each part of the app.</p></details>
  </section>

  </div>
</div>`;

  await write("tutorial/index.html", renderPage({
    title: "Desktop app tutorial · NOSHASHI",
    description: "Learn the NOSHASHI desktop app in ten minutes: every screen, what it answers, how to use it in three steps, and which plan it needs.",
    path: "/tutorial/",
    current: "resources",
    head: `<link rel="stylesheet" href="/assets/tutorial.css">`,
    body,
    structured: [breadcrumb("Desktop app tutorial", "/tutorial/")],
  }));
}

export const TUTORIAL_PAGES = [["/tutorial/", "monthly", "0.8"]];
