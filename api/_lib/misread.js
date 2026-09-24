/**
 * "The ledger can be transparent and still be misread" — the landing
 * page's section, rendered from src/lib/learn/misread.rendered.json.
 *
 * That file is the output of misreadCases() in the app: recorded mainnet
 * replies run through NOSHASHI's own interpreters. A test keeps it
 * identical to what the code produces, so the "verified" column on the
 * landing page is the code's answer, not copy.
 */

import { esc } from "./html.js";

const EXPLORER = "https://livenet.xrpl.org";

function evidenceLink(evidence) {
  const tx = /^[0-9A-F]{64}$/.test(evidence.ref);
  const href = `${EXPLORER}/${tx ? "transactions" : "accounts"}/${evidence.ref}`;
  const text = tx ? `${evidence.ref.slice(0, 10)}…` : evidence.ref;
  return `<a href="${esc(href)}" rel="noopener">${esc(text)}</a>`;
}

/** One row per case: the trap and why, what a basic interface sees, what NOSHASHI verifies. */
export function renderMisread(cases) {
  const rows = cases
    .map(
      (c) => `<div class="trap mis">
        <div>
          <p class="tf">${esc(c.title)}</p>
          <p class="tw">${esc(c.why)}</p>
          <p class="te">Ledger ${Number(c.evidence.ledger).toLocaleString("en-US")} · ${esc(c.evidence.refLabel)} ${evidenceLink(c.evidence)}</p>
        </div>
        <div class="mis-b"><p class="mk">What a basic interface sees</p><p class="ml">${esc(c.basic.label)}</p><p class="mv">${esc(c.basic.value)}</p></div>
        <div class="mis-v"><p class="mk">What NOSHASHI verifies</p><p class="ml">${esc(c.verified.label)}</p><p class="mv">${esc(c.verified.value)}</p></div>
      </div>`
    )
    .join("\n      ");
  return `<div class="traps">
      ${rows}
    </div>`;
}
