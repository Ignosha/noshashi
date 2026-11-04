import { readFile } from "node:fs/promises";
import { renderPage, breadcrumb } from "../api/_lib/shell.js";
import { esc } from "../api/_lib/html.js";
const tools = JSON.parse(
  await readFile(
    new URL("../src/lib/security/tools.json", import.meta.url),
    "utf8",
  ),
);
const labels = {
  operator: "Free",
  desk: "Pro",
  institution: "Institutional",
  enterprise: "Enterprise",
  strategic: "Strategic Infrastructure",
};
export const CYBERSECURITY_PAGES = [["/cybersecurity/", "weekly", "0.9"]];
export async function buildCybersecurity(write) {
  const body = `<div class="cyber-hero"><div><p class="eyebrow">XRPL CYBERSECURITY · DESKTOP BETA</p><h1>Know who can sign.<br><em>See what changed.</em></h1><p class="cyber-lead">Security intelligence for wallet owners, treasury teams and incident reviewers. Inspect signing authority, review proposed payments and preserve evidence for the next human decision.</p><div class="cta"><a class="btn" href="#quorum-lab">Try the signer-loss lab</a><a class="btn ghost" href="/#download">Get the desktop tools</a></div><p class="cyber-note">The website lab is local arithmetic. The desktop suite reads public XRPL data. Neither holds keys, signs transactions or moves funds.</p></div><figure class="cyber-instrument"><svg viewBox="0 0 400 320" role="img" aria-label="Signing control paths: master key, regular key and signer quorum can lead to account authority"><g fill="none" stroke="currentColor"><circle cx="200" cy="160" r="118"/><circle cx="200" cy="160" r="108" opacity=".3"/><path d="M200 42v77M85 180h76M315 180h-76"/><rect x="161" y="121" width="78" height="78"/><path d="m185 160 11 10 23-27" stroke-width="2"/></g><g fill="currentColor" text-anchor="middle" font-family="monospace" font-size="11"><text x="200" y="24">MASTER KEY</text><text x="60" y="213">REGULAR KEY</text><text x="331" y="213">QUORUM</text><text x="200" y="304">CONFIGURED PATH ≠ VERIFIED CUSTODY</text></g></svg><figcaption>Each direct key can bypass signer quorum when enabled. The map explains authority; it does not establish possession or operational independence.</figcaption></figure></div>
 <section class="cyber-limit" aria-label="Recovery limits"><h2>Evidence can help a response. It cannot reverse XRP.</h2><p>Validated XRP payments have no chargeback, and XRP cannot be frozen or clawed back by a token issuer. A verified custodian may investigate a deposit under its procedures. An issued-token issuer may have conditional freeze or clawback powers over its own tokens. NOSHASHI cannot seize assets, guarantee recovery, identify an attacker from a graph alone or secure a compromised device.</p><p>Never share a seed, private key or recovery phrase. Preserve hashes and timestamps; verify a service’s official contact route independently. Destination tags and self-declared domains do not verify a custodian.</p></section>
 <section id="treasury-guard" aria-labelledby="treasury-guard-title"><p class="eyebrow">TREASURY GUARD / DEVICE-LOCAL BETA</p><h2 id="treasury-guard-title">A large transfer deserves a human check.</h2><p class="cyber-lead">Set XRP limits for individual payments, a rolling window and the share of the account balance. Flag destinations outside your allowlist and large totals split across several wallets. Inspect the validated payment evidence, then mark the activity expected or not recognized.</p><div class="cyber-grid"><article class="cyber-card"><p class="eyebrow">01 / BEFORE SIGNING</p><h3>Review the proposal.</h3><p>Check an unsigned direct XRP Payment against saved static limits. This is advisory: current balance, cumulative activity, destination risk and independent approvals need separate checks. Your signing system must enforce any hold.</p></article><article class="cyber-card"><p class="eyebrow">02 / AFTER VALIDATION</p><h3>Notify the configured operator.</h3><p>Local device notifications while the app is open, with permission. Reads run approximately once a minute, subject to node availability and backlog. No wallet owner is inferred or automatically emailed.</p></article><article class="cyber-card"><p class="eyebrow">03 / RESPONSE</p><h3>Preserve evidence. Investigate.</h3><p>Record a local review, export the complete local record with a hash and open incident or signing-control tools. A threshold flag is not proof of theft; validated XRP cannot be reversed.</p></article></div><p class="cyber-note">Free: three local watches. Pro and above: fifty. A new watch begins at its first successful ledger baseline. Direct XRP Payments require delivered-amount and sender-balance evidence; unsupported payment forms and incomplete data remain review gaps. Monitoring stops when the app is closed. Hosted payment alerts, verified recipients, enforced approvals and response commitments require a separately configured integration; they are not supplied by this local feature.</p><div class="cta"><a class="btn" href="/#download">Evaluate Treasury Guard</a><a class="btn ghost" href="/design-partners/#apply">Discuss a treasury security pilot</a></div></section>
 <section id="institutional-security" aria-labelledby="institutional-security-title"><p class="eyebrow">INTRODUCING / FIVE SECURITY WORKFLOWS · BETA</p><h2 id="institutional-security-title">Prepare. Compare. Respond.</h2><p class="cyber-lead">For treasury operators, wallet teams and incident reviewers: investigate shared dependencies, compare ledger evidence and prepare a response before an incident. Start with free local scenarios; evaluate team workflows against your own acceptance criteria.</p><div class="cyber-grid">${tools
   .filter((t) =>
     [
       "contingency",
       "integrity",
       "dependencies",
       "readiness",
       "sharing",
     ].includes(t.id),
   )
   .map(
     (t) =>
       `<article class="cyber-card"><p class="eyebrow">${labels[t.plan]} / ${t.id === "sharing" ? "BACKEND SETUP + PARTICIPANT REVIEW REQUIRED" : "DESKTOP BETA"}</p><h3>${esc(t.title)}</h3><p>${esc(t.detail)}</p></article>`,
   )
   .join(
     "",
   )}</div><p class="cyber-note">OSV checks send package names and exact versions only after consent. The response notebook is device-local encrypted storage, not a key vault. Reviewed sharing is disabled until its migration and review process are installed; no verified participants or coverage are claimed. These tools cannot guarantee prevention, fund recovery or enterprise suitability.</p><div class="cta"><a class="btn" href="/#download">Evaluate desktop tools</a><a class="btn ghost" href="/design-partners/#apply">Scope a security pilot</a></div></section>
 <section id="quorum-lab" class="cyber-lab"><div><p class="eyebrow">FREE BROWSER LAB · LOCAL SCENARIO</p><h2>Would your quorum survive a signer outage?</h2><p>Model an outage of the highest-weight signers. This uses the same minimum-signer arithmetic as the desktop control check. No ledger request, wallet connection or account is required.</p></div><form id="security-quorum"><label>Signer weights, separated by commas<input name="weights" value="1,1,1" required autocomplete="off" aria-describedby="quorum-help"></label><div class="cyber-fields"><label>Required quorum<input name="quorum" type="number" value="2" min="1" max="4294967295" required></label><label>Highest-weight signers unavailable<input name="lost" type="number" value="1" min="0" max="8" required></label></div><p id="quorum-help" class="cyber-note">Up to eight signer weights. A weight is not a count of people; shared custody can defeat independence.</p><label class="cyber-check"><input name="master" type="checkbox"> Master key can sign alone</label><label class="cyber-check"><input name="regular" type="checkbox"> Regular key is configured</label><button class="btn" type="submit">Run the local drill →</button></form><div id="security-quorum-result" role="status" aria-live="polite" class="cyber-result">Enter a scenario to run the drill.</div><noscript><p>Enable JavaScript to run the local calculator. The tool descriptions and limitations remain readable.</p></noscript></section>
 ${["protect", "investigate", "operate"]
   .map(
     (group, i) =>
       `<section><div class="cyber-section-head"><p class="eyebrow">0${i + 1} / ${group.toUpperCase()}</p><h2>${group === "protect" ? "Close the avoidable gaps." : group === "investigate" ? "Build an evidence-led response." : "Give the team a review workflow."}</h2></div><div class="cyber-grid">${tools
         .filter(
           (t) =>
             t.group === group &&
             ![
               "contingency",
               "integrity",
               "dependencies",
               "readiness",
               "sharing",
             ].includes(t.id),
         )
         .map(
           (t) =>
             `<article class="cyber-card"><p class="eyebrow">${esc(t.priority)} / ${labels[t.plan]} · DESKTOP BETA</p><h3>${esc(t.title)}</h3><p>${esc(t.detail)}</p></article>`,
         )
         .join("")}</div></section>`,
   )
   .join("")}
 <section><p class="eyebrow">CAPACITY AND WORKFLOW · EXISTING PRICES UNCHANGED</p><h2>Safety first. Team operations when needed.</h2><div class="cyber-table" tabindex="0" role="region" aria-label="Security tier comparison"><table><caption>Priorities describe workflow urgency, not guaranteed risk reduction. Contract tiers require agreed scope and deployment checks.</caption><thead><tr><th scope="col">Tier</th><th scope="col">Recommended first workflow</th><th scope="col">Access and limits</th></tr></thead><tbody><tr><th scope="row">Free / P0</th><td>Signing map, signer-loss and shared-dependency scenarios, ledger endpoint comparison, pre-sign inspection and emergency checklist</td><td>Basic safety checks stay available. Local monitoring needs the app open.</td></tr><tr><th scope="row">Pro / P1</th><td>Control-change comparison, consent-based software advisories, encrypted local response notebook and bounded incident evidence</td><td>Saved device-local references; standard trace is two hops. Not an unattended response service.</td></tr><tr><th scope="row">Institutional / P2</th><td>Organization audit/review, bulk exposure, threat-report filing and reserve-evidence workflows</td><td>Contract required. Reviewed sharing additionally needs backend setup, participant review and MFA staff moderation. Reports and declared liabilities require independent review.</td></tr><tr><th scope="row">Enterprise / P2–P3</th><td>Withdrawal review, deeper forensic cases and market surveillance</td><td>Contract and configured workflow required. Five-hop traces have bounded history and do not prove fund ownership.</td></tr><tr><th scope="row">Strategic Infrastructure / P3</th><td>Hosted change monitoring and organization event feeds</td><td>Contract, watches and delivery configuration required; no guaranteed response or recovery time.</td></tr></tbody></table></div><p><a href="/pricing/">Current prices and full plan definitions →</a></p></section>
 <section class="cyber-limit"><h2>Beta boundaries, beside the tools.</h2><p>Public-node responses do not independently verify consensus, legal rights, reserves or compliance. SHA-256 hashes identify evidence bytes; they are not digital signatures. A local reference is editable. The desktop installers are not OS code-signed or notarized; updater signatures are separate.</p><p>SSO, dedicated environments and uptime SLAs are planned, not offered here. No independent security assessment, certification or guaranteed recovery service is claimed.</p><p>Protocol sources: <a href="https://xrpl.org/docs/concepts/accounts/cryptographic-keys" rel="noopener">XRPL signing keys</a> · <a href="https://xrpl.org/docs/tutorials/best-practices/key-management/disable-master-key-pair" rel="noopener">Master-key precautions</a> · <a href="https://xrpl.org/docs/concepts/tokens/fungible-tokens/clawing-back-tokens" rel="noopener">Clawback limits</a></p></section>
 <section class="band"><div><p class="eyebrow">A SCOPED EVALUATION</p><h2>Bring one wallet workflow.</h2><p>Propose a pilot covering signing-control review, evidence completeness or review time. Scope, deliverables and success measures are agreed before work begins. No keys or shared credentials.</p></div><div class="cta"><a class="btn" href="/design-partners/#apply">Discuss a scoped pilot</a><a class="btn ghost" href="/institutional-demo/">Try public evidence tools</a></div></section>`;
  await write(
    "cybersecurity/index.html",
    renderPage({
      title: "XRPL cybersecurity tools · NOSHASHI",
      description:
        "Signing authority, signer-loss drills, control-change review and incident evidence for XRP Ledger wallet owners and institutional teams. Clear recovery limits; no keys or custody.",
      path: "/cybersecurity/",
      current: "platform",
      head: '<link rel="stylesheet" href="/assets/cybersecurity.css">',
      body,
      scripts: '<script src="/assets/security-lab.js" defer></script>',
      structured: [breadcrumb("XRPL cybersecurity", "/cybersecurity/")],
    }),
  );
}
