import { snapshot, example, evaluate } from "./review.js";

export function mountDesk(root, save) {
  let rows = evaluate(example);
  const owners = new Map();
  root.innerHTML = `<article><header><small>Ledger Desk v2 · Sample workspace</small><h1>NOSHASHI Continuity</h1>
  <p>Issuer offboarding review</p></header><p>Fictional portfolio as of 20 November 2026. The sample policy requires review of outstanding balances after 30 days. Reviewer assignments last for this session.</p>
  <div class="actions"><label>Import sample closure list <input type="file" accept=".json"></label>
  <button data-example>Save example list</button><button data-report>Export review</button></div>
  <p role="status"></p><section aria-label="Review queue"></section>
  <details><summary>More Continuity tools</summary><p>The desktop Access forecast &amp; rule impact workspace projects credential expiry and tests proposed rule removals. Payment Reconciliation and Lending Exposure are proposed extensions.</p></details></article>`;
  const status = root.querySelector('[role=status]');
  function render() {
    const cards = rows.map(row => {
      const card = document.createElement("section");
      card.className = "case";
      const heading = document.createElement("h3");
      heading.textContent = row.id + " · " + row.result;
      const evidence = document.createElement("p");
      evidence.textContent = (row.facts ? row.facts.wallet + " · " + row.facts.balance + " DEMO" : "No verified mapping in the sample snapshot") + " · Closed " + row.closed;
      const label = document.createElement("label");
      label.textContent = "Reviewer ";
      const select = document.createElement("select");
      for (const name of ["Unassigned", "Issuer operations", "Compliance review"]) select.add(new Option(name, name));
      select.value = owners.get(row.id) || "Unassigned";
      select.onchange = () => owners.set(row.id, select.value);
      label.append(select);
      card.append(heading, evidence, label);
      return card;
    });
    root.querySelector('[aria-label="Review queue"]').replaceChildren(...cards);
  }
  async function download(file, data) {
    try { await save(file, JSON.stringify(data, null, 2)); status.textContent = "Exported " + file; }
    catch { status.textContent = "Export failed. Your review is still open."; }
  }
  root.querySelector("[data-example]").onclick = () => download("continuity-example.json", example);
  root.querySelector("[data-report]").onclick = () => download("continuity-sample-review.json", {
    source: "fictional fixture", asOf: snapshot.asOf, issuer: snapshot.issuer, asset: snapshot.asset,
    policy: "Review outstanding balances at 30 days", cases: rows.map(row => ({ ...row, reviewer: owners.get(row.id) || "Unassigned" }))
  });
  root.querySelector("input").onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 100000) throw Error("Maximum sample file size is 100 KB.");
      const next = evaluate(JSON.parse(await file.text()));
      rows = next; owners.clear(); render(); status.textContent = "Imported " + rows.length + " sample cases.";
    } catch (e) { status.textContent = "Import failed. " + e.message; }
    event.target.value = "";
  };
  render();
}
