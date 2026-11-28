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
const origin = location.origin;
let report;

const addressInput = byId("address");
const hashInput = byId("hash");
const tagInput = byId("tag");
const receiptSchemas = new Set(["noshashi.asset-risk.v1", "noshashi.destination-preflight.v1", "noshashi.payment-receipt.v1"]);

function apiPath() {
  const address = addressInput.value.trim();
  if (tool.value === "payment-receipt") {
    return `/api/v1/payment-receipt?${new URLSearchParams({ hash: hashInput.value.trim() })}`;
  }
  if (tool.value === "destination-preflight") {
    const query = new URLSearchParams({ account: address });
    if (tagInput.value !== "") query.set("tag", tagInput.value);
    return `/api/v1/destination-preflight?${query}`;
  }
  if (tool.value === "issuer-state") return `/api/issuer-state?${new URLSearchParams({ issuer: address })}`;
  if (tool.value === "rippling") return `/api/v1/rippling?${new URLSearchParams({ account: address })}`;

  const query = new URLSearchParams({ issuer: address, currency: byId("currency").value.trim() });
  const size = byId("size").value;
  if (size) query.set("size", size);
  return `/api/v1/asset-risk?${query}`;
}

function updateRequest() {
  const assetRisk = tool.value === "asset-risk";
  const preflight = tool.value === "destination-preflight";
  const payment = tool.value === "payment-receipt";
  asset.hidden = asset.disabled = !assetRisk;
  byId("hash-fields").hidden = hashInput.disabled = !payment;
  byId("account-fields").hidden = addressInput.disabled = payment;
  byId("tag-fields").hidden = tagInput.disabled = !preflight;
  byId("address-label").textContent = preflight ? "Destination account" :
    tool.value === "rippling" ? "Wallet account" : "Issuing account";
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
  const controls = [tool, addressInput, hashInput, tagInput, byId("currency"), byId("size"), submit];
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
    verifyResult.hidden = !receiptSchemas.has(data.schema) || !data.receipt;
    status.textContent = `Response received · HTTP ${response.status}`;
  } catch (error) {
    status.textContent = `Check could not complete. ${error.message}`;
  } finally {
    controls.forEach((control) => { control.disabled = false; });
    updateRequest();
  }
});

const shelf = byId("shelf");
const prev = byId("prev");
const next = byId("next");

function updateShelfControls() {
  prev.disabled = shelf.scrollLeft < 2;
  next.disabled = shelf.scrollLeft + shelf.clientWidth >= shelf.scrollWidth - 2;
}

function stepShelf(direction) {
  const [first, second] = shelf.children;
  if (first && second) shelf.scrollBy({ left: (second.offsetLeft - first.offsetLeft) * direction });
}

prev.parentElement.hidden = false;
prev.addEventListener("click", () => stepShelf(-1));
next.addEventListener("click", () => stepShelf(1));
shelf.addEventListener("scroll", updateShelfControls, { passive: true });
shelf.addEventListener("keydown", (event) => {
  if (event.target !== shelf || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  stepShelf(event.key === "ArrowLeft" ? -1 : 1);
});
new ResizeObserver(updateShelfControls).observe(shelf);
updateShelfControls();

shelf.addEventListener("click", (event) => {
  const selected = event.target.closest("[data-mp-tool]");
  if (!selected || tool.disabled) return;
  tool.value = selected.dataset.mpTool;
  tool.dispatchEvent(new Event("input", { bubbles: true }));
  tool.focus({ preventScroll: true });
});

async function copy(value, status, success) {
  try {
    await navigator.clipboard.writeText(value);
    status.textContent = success;
    return true;
  } catch {
    status.textContent = "Clipboard access was unavailable.";
    return false;
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
    receiptStatus.textContent = "Use an API response under one million characters.";
    return;
  }
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  receiptStatus.textContent = "Calculating digest…";
  try {
    const { receipt, ...body } = JSON.parse(json);
    if (!receiptSchemas.has(body.schema) || receipt?.algorithm !== "SHA-256" ||
        typeof receipt.digest !== "string" || !hashPattern.test(receipt.digest)) {
      throw new Error("Paste a supported NOSHASHI report with a SHA-256 receipt.");
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

const marketplaceQuery = new URLSearchParams(location.search);
const sandbox = marketplaceQuery.get("sandbox") === "1";

const claimStorageKey = "noshashi.rippling.claim";
let claimSession = new URLSearchParams(location.hash.slice(1)).get("claim");
try {
  if (marketplaceQuery.get("checkout") === "submitted" && claimSession) {
    sessionStorage.setItem(claimStorageKey, claimSession);
    history.replaceState(null, "", location.pathname + "#plans");
  } else {
    claimSession = sessionStorage.getItem(claimStorageKey);
  }
} catch {
  // Without tab storage, leave the original claim fragment available for refresh.
}

if (claimSession) {
  const keyStatus = byId("key-status");
  const claimButton = byId("key-claim");
  const keyField = byId("issued-key");
  const copyButton = byId("key-copy");
  byId("checkout-return").hidden = false;
  claimButton.hidden = false;
  keyStatus.textContent = "Claim your key after Stripe confirms payment.";
  byId("checkout-return").scrollIntoView();

  claimButton.addEventListener("click", async () => {
    claimButton.disabled = true;
    keyStatus.textContent = "Verifying payment…";
    try {
      const response = await fetch(checkoutEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ product: "rippling-key-claim", sessionId: claimSession }),
      });
      const body = await response.json();
      if (!response.ok || typeof body.key !== "string") throw new Error(body.error || "Could not claim API key.");
      keyField.value = body.key;
      keyField.hidden = copyButton.hidden = byId("issued-key-label").hidden = false;
      claimButton.hidden = true;
      keyStatus.textContent = "Payment confirmed. Save your key before leaving this page.";
    } catch (error) {
      keyStatus.textContent = error.message;
      claimButton.disabled = false;
    }
  });

  copyButton.addEventListener("click", async () => {
    if (!await copy(keyField.value, keyStatus, "API key copied. Store it securely.")) return;
    try {
      sessionStorage.removeItem(claimStorageKey);
      history.replaceState(null, "", location.pathname + "#plans");
    } catch {
      // The key was copied even if browser storage was unavailable.
    }
  });
}

async function loadCheckoutAvailability() {
  try {
    const response = await fetch(`${checkoutEndpoint}?product=rippling-api`, { cache: "no-store" });
    if (!response.ok) return;
    const { cardCheckout, sandboxCheckout } = await response.json();
    if (sandbox ? sandboxCheckout !== true : cardCheckout !== true) return;
    for (const button of checkoutButtons) {
      if (sandbox) button.textContent = button.textContent.replace(/^Buy /, "Test ");
      button.hidden = false;
    }
    if (sandbox) checkoutStatus.textContent = "Stripe sandbox checkout. Use a Stripe test card.";
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
        body: JSON.stringify({ product: "rippling-api", plan: button.dataset.mpCheckout, sandbox }),
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
