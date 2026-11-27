import { receiptFor } from "./asset-risk-receipt.mjs";

const byId = (id) => document.getElementById(`mp-${id}`);
const request = byId("request");
const tool = byId("tool");
const asset = byId("asset");
const result = byId("result");
const status = byId("response-status");
const download = byId("download");
const verifyResult = byId("verify-result");
const receiptStatus = byId("receipt-status");
const origin = "https://www.noshashi.app";
let report;

function apiPath() {
  const address = byId("address").value.trim();
  if (tool.value === "rippling") {
    return `/api/v1/rippling?${new URLSearchParams({ account: address })}`;
  }
  const query = new URLSearchParams({ issuer: address, currency: byId("currency").value.trim() });
  const size = byId("size").value;
  if (size) query.set("size", size);
  return `/api/v1/asset-risk?${query}`;
}

function updateRequest() {
  const rippling = tool.value === "rippling";
  asset.hidden = rippling;
  asset.disabled = rippling;
  byId("address-label").textContent = rippling ? "Wallet account" : "Issuing account";
  const url = JSON.stringify(origin + apiPath());
  const snippets = {
    curl: `curl --fail-with-body ${url}`,
    js: `const response = await fetch(${url});\nif (!response.ok) throw new Error(await response.text());\nconsole.log(await response.json());`,
    python: `import json\nfrom urllib.request import urlopen\n\nwith urlopen(${url}, timeout=15) as response:\n    print(json.load(response))`,
  };
  byId("code").textContent = snippets[byId("language").value];
}

function clearReport() {
  report = undefined;
  result.hidden = download.hidden = verifyResult.hidden = true;
}

request.addEventListener("input", () => {
  updateRequest();
  clearReport();
  status.textContent = "Run a check to see the API response.";
});
byId("language").addEventListener("change", updateRequest);

request.addEventListener("submit", async (event) => {
  event.preventDefault();
  const path = apiPath();
  const submit = request.querySelector("button");
  const controls = [tool, byId("address"), byId("currency"), byId("size"), submit];
  clearReport();
  controls.forEach((control) => { control.disabled = true; });
  status.textContent = "Reading the XRP Ledger…";
  try {
    const response = await fetch(path, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    report = data;
    result.textContent = JSON.stringify(data, null, 2);
    result.hidden = download.hidden = false;
    verifyResult.hidden = data.schema !== "noshashi.asset-risk.v1" || !data.receipt;
    status.textContent = `Response received · HTTP ${response.status}`;
  } catch (error) {
    status.textContent = `Check could not complete. ${error.message}`;
  } finally {
    controls.forEach((control) => { control.disabled = false; });
    updateRequest();
  }
});

async function copy(value, status, success) {
  try {
    await navigator.clipboard.writeText(value);
    status.textContent = success;
  } catch {
    status.textContent = "Clipboard access was unavailable.";
  }
}

byId("copy").addEventListener("click", () => copy(byId("code").textContent, byId("copy-status"), "Request copied."));
byId("share").addEventListener("click", () => copy(origin + "/marketplace/", byId("share-status"), "Marketplace link copied."));

download.addEventListener("click", () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([result.textContent], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "noshashi-ledger-response.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
});

verifyResult.addEventListener("click", () => {
  byId("json").value = result.textContent;
  byId("digest").value = "";
  receiptStatus.textContent = "";
  byId("json").focus();
});

const hashPattern = /^[0-9a-f]{64}$/i;
byId("receipt").addEventListener("input", () => { receiptStatus.textContent = ""; });
byId("receipt").addEventListener("submit", async (event) => {
  event.preventDefault();
  const json = byId("json").value;
  const savedDigest = byId("digest").value.trim().toUpperCase();
  if (json.length > 1_000_000) {
    receiptStatus.textContent = "Use an Asset Risk response under one million characters.";
    return;
  }
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  receiptStatus.textContent = "Calculating digest…";
  try {
    const { receipt, ...body } = JSON.parse(json);
    if (body.schema !== "noshashi.asset-risk.v1" || receipt?.algorithm !== "SHA-256" ||
        typeof receipt.digest !== "string" || !hashPattern.test(receipt.digest)) {
      throw new Error("Paste a complete Asset Risk v1 response with a SHA-256 receipt.");
    }
    const digest = await receiptFor(body);
    if (byId("json").value !== json || byId("digest").value.trim().toUpperCase() !== savedDigest) return;
    const receiptMatches = digest === receipt.digest.toUpperCase();
    const savedMatches = digest === savedDigest;
    const message = savedDigest
      ? `Included receipt ${receiptMatches ? "matches" : "does not match"}. Saved digest ${savedMatches ? "matches" : "does not match"}.`
      : `Included receipt ${receiptMatches ? "matches" : "does not match"}.`;
    receiptStatus.textContent = `${message} Computed digest: ${digest}`;
  } catch (error) {
    receiptStatus.textContent = error instanceof SyntaxError ? "Paste valid JSON." : error.message;
  } finally {
    button.disabled = false;
  }
});

updateRequest();

const checkoutButtons = [...document.querySelectorAll("[data-mp-checkout]")];
const checkoutStatus = byId("checkout-status");
const checkoutEndpoint = "/api/create-checkout-session";

if (new URLSearchParams(location.search).get("checkout") === "submitted") {
  byId("checkout-return").hidden = false;
}

async function loadCheckoutAvailability() {
  try {
    const response = await fetch(`${checkoutEndpoint}?product=rippling-api`, { cache: "no-store" });
    if (!response.ok) return;
    const { cardCheckout } = await response.json();
    if (cardCheckout === true) checkoutButtons.forEach((button) => { button.hidden = false; });
  } catch {
    // Invoice ordering remains available when checkout status cannot be read.
  }
}

for (const button of checkoutButtons) {
  button.addEventListener("click", async () => {
    checkoutButtons.forEach((item) => { item.disabled = true; });
    checkoutStatus.textContent = "Opening Stripe checkout…";
    try {
      const response = await fetch(checkoutEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ product: "rippling-api", plan: button.dataset.mpCheckout }),
      });
      if (!response.ok) throw new Error("Checkout unavailable");
      const { url } = await response.json();
      const checkout = new URL(url);
      if (checkout.origin !== "https://checkout.stripe.com") throw new Error("Unexpected checkout URL");
      location.assign(checkout.href);
    } catch {
      checkoutStatus.textContent = "Card checkout could not open. Retry or request an invoice below.";
      checkoutButtons.forEach((item) => { item.disabled = false; });
    }
  });
}

loadCheckoutAvailability();
