import {
  ADDRESS_RE,
  verifyCertificate,
  capturedView,
} from "./desk-experience-core.mjs";

if (document.body.hasAttribute("data-ledger-experience")) {
  const layers = [
    {
      title: "Who still holds the power?",
      copy: "Inspect the controls an issuer retains over the assets you hold.",
      href: "/certificate/",
      action: "Inspect issuer authority",
    },
    {
      title: "What could actually fill?",
      copy: "Look beyond a quoted order book to the funds its offer owners hold.",
      href: "/book-health/",
      action: "Explore executable liquidity",
    },
    {
      title: "Can you check the answer?",
      copy: "Keep the ledger, the rules and a fingerprint you can recompute.",
      href: "/evidence-report/",
      action: "Explore evidence reports",
    },
  ];
  const layerButtons = [...document.querySelectorAll("[data-lx-layer]")];
  layerButtons.forEach((button) =>
    button.addEventListener("click", () => {
      const index = Number(button.dataset.lxLayer),
        layer = layers[index];
      if (!layer) return;
      layerButtons.forEach((b) =>
        b.setAttribute("aria-pressed", String(b === button)),
      );
      document
        .querySelectorAll("[data-lx-plane]")
        .forEach((plane) =>
          plane.toggleAttribute(
            "data-active",
            Number(plane.dataset.lxPlane) === index,
          ),
        );
      document.querySelector("[data-lx-layer-title]").textContent = layer.title;
      document.querySelector("[data-lx-layer-copy]").textContent = layer.copy;
      const link = document.querySelector("[data-lx-layer-link]");
      link.href = layer.href;
      link.firstChild.textContent = layer.action + " ";
    }),
  );

  const form = document.getElementById("lx-issuer-form");
  const input = document.getElementById("lx-issuer");
  const result = document.getElementById("lx-result");
  const submit = document.getElementById("lx-read");
  const download = document.getElementById("lx-download");
  const presets = [...document.querySelectorAll("[data-lx-issuer]")];
  let generation = 0,
    activeRequest = null,
    certificate = null;
  const set = (selector, value) => {
    result.querySelector(selector).textContent = value;
  };
  const step = (name, complete) =>
    document
      .querySelector(`[data-lx-step="${name}"]`)
      .toggleAttribute("data-complete", complete);
  function clearRecord(message) {
    certificate = null;
    download.disabled = true;
    result.removeAttribute("data-verdict");
    result.removeAttribute("aria-busy");
    set("[data-lx-verdict]", "Not read");
    set("[data-lx-record-ref]", "Awaiting your investigation");
    set("[data-lx-ledger]", "—");
    set("[data-lx-rules]", "—");
    result.querySelectorAll("[data-lx-check]").forEach((el) => {
      el.textContent = "Not read";
      el.removeAttribute("title");
    });
    set(
      "[data-lx-digest]",
      "No fingerprint until a complete reply is verified.",
    );
    set(
      "[data-lx-verified]",
      "The record remains empty until verification succeeds.",
    );
    set("[data-lx-status]", message);
    ["read", "verify", "keep"].forEach((name) => step(name, false));
  }
  function subjectChanged() {
    generation++;
    activeRequest?.abort();
    activeRequest = null;
    submit.disabled = false;
    input.value = input.value.trim();
    result.dataset.state = "idle";
    clearRecord(
      "Press “Read issuer controls” to retrieve a validated reading.",
    );
    const issuer = input.value;
    step("choose", ADDRESS_RE.test(issuer));
    presets.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.lxIssuer === issuer),
      ),
    );
    document.getElementById("lx-full-certificate").href =
      "/certificate/?issuer=" + encodeURIComponent(issuer);
  }
  input.addEventListener("input", subjectChanged);
  presets.forEach((button) =>
    button.addEventListener("click", () => {
      input.value = button.dataset.lxIssuer;
      subjectChanged();
    }),
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || !ADDRESS_RE.test(input.value.trim())) return;
    const issuer = input.value.trim(),
      version = ++generation;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    clearRecord(
      "Reading validated issuer controls. Waiting for the public ledger…",
    );
    result.dataset.state = "reading";
    result.setAttribute("aria-busy", "true");
    submit.disabled = true;
    try {
      const response = await fetch(
        "/api/authority?issuer=" + encodeURIComponent(issuer),
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("unavailable");
      const reply = await response.json();
      if (!(await verifyCertificate(reply, issuer)))
        throw new Error("unverified");
      if (version !== generation) return;
      certificate = reply;
      set(
        "[data-lx-record-ref]",
        `Ledger ${reply.ledgerIndex.toLocaleString("en-US")}`,
      );
      set("[data-lx-verdict]", reply.verdict.replace(/-/g, " "));
      result.dataset.verdict = reply.verdict;
      set("[data-lx-ledger]", reply.ledgerIndex.toLocaleString("en-US"));
      set("[data-lx-rules]", String(reply.rulesVersion));
      result.querySelectorAll("[data-lx-check]").forEach((el) => {
        const check = reply.checks.find((k) => k.id === el.dataset.lxCheck);
        el.textContent = check.passed ? "Yes" : "No";
        el.title = typeof check.detail === "string" ? check.detail : "";
      });
      set("[data-lx-digest]", reply.digest);
      set(
        "[data-lx-verified]",
        "Fingerprint verified in this browser. The published record matches the recomputed SHA-256 digest.",
      );
      set(
        "[data-lx-status]",
        `Read ${new Date(reply.evaluatedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC. A recorded reading, not a continuous monitor.`,
      );
      result.dataset.state = "verified";
      download.disabled = false;
      step("read", true);
      step("verify", true);
      document.getElementById("lx-full-certificate").href =
        "/certificate/?issuer=" + encodeURIComponent(issuer);
    } catch {
      if (version !== generation) return;
      clearRecord(
        "A complete, verifiable reply was not available. No verdict or fingerprint is shown. Press “Read issuer controls” to retry.",
      );
      result.dataset.state = "unavailable";
    } finally {
      clearTimeout(timeout);
      if (version === generation) {
        submit.disabled = false;
        result.removeAttribute("aria-busy");
        activeRequest = null;
      }
    }
  });
  download.addEventListener("click", () => {
    if (!certificate) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(certificate, null, 2) + "\n"], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `noshashi-authority-${certificate.issuer}-${certificate.ledgerIndex}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    step("keep", true);
  });

  const views = {
    verification: {
      title: "Verification",
      alt: "Recorded NOSHASHI verification screen showing a settlement decision and the rules evaluated.",
    },
    audit: {
      title: "Audit trail",
      alt: "Recorded NOSHASHI audit trail showing validated payment history and delivered amounts.",
    },
    sync: {
      title: "Ledger sync",
      alt: "Recorded NOSHASHI ledger sync screen comparing four named public nodes.",
    },
  };
  const image = document.getElementById("lx-product-image"),
    caption = document.getElementById("lx-product-caption");
  let captureManifest = {};
  try {
    captureManifest = JSON.parse(
      document.getElementById("lx-shot-data").textContent,
    );
  } catch {
    /* Leave the record honestly unavailable. */
  }
  const viewButtons = [...document.querySelectorAll("[data-lx-view]")];
  function selectView(key) {
    const view = views[key];
    if (!view) return;
    viewButtons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.lxView === key),
      ),
    );
    const capture = capturedView(captureManifest, key);
    image.src = capture?.src ?? `/assets/shots/${key}.webp`;
    image.alt = capture?.alt ?? view.alt;
    caption.textContent =
      capture?.caption ??
      "Recorded desktop view. Capture date and ledger metadata are unavailable.";
    document.querySelector("[data-lx-window-title]").textContent =
      `${view.title} / Recorded desktop view`;
  }
  viewButtons.forEach((button) =>
    button.addEventListener("click", () => selectView(button.dataset.lxView)),
  );
  selectView("verification");

  const imageDialog = document.getElementById("lx-image-dialog");
  const commandDialog = document.getElementById("lx-command-dialog");
  if (typeof commandDialog.showModal === "function") {
    const trigger = document.querySelector("[data-lx-command]");
    trigger.hidden = false;
    const search = document.getElementById("lx-command-search");
    const tools = [...commandDialog.querySelectorAll("[data-lx-tool]")];
    function filter() {
      let count = 0;
      const query = search.value.toLowerCase().trim();
      tools.forEach((link) => {
        link.hidden = !link.textContent.toLowerCase().includes(query);
        if (!link.hidden) count++;
      });
      commandDialog.querySelector("[data-lx-empty]").hidden = count > 0;
    }
    function open() {
      if (imageDialog.open) return;
      search.value = "";
      filter();
      commandDialog.showModal();
      search.focus();
    }
    trigger.addEventListener("click", open);
    search.addEventListener("input", filter);
    tools.forEach((link) =>
      link.addEventListener("click", () => commandDialog.close()),
    );
    document.addEventListener("keydown", (event) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !event.altKey
      ) {
        if (
          !commandDialog.open &&
          (event.target.isContentEditable ||
            /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))
        )
          return;
        event.preventDefault();
        if (commandDialog.open) commandDialog.close();
        else open();
      }
    });
    const zoom = document.querySelector("[data-lx-zoom]");
    zoom.hidden = false;
    zoom.addEventListener("click", () => {
      const large = imageDialog.querySelector("img");
      large.src = image.src;
      large.alt = image.alt;
      imageDialog.querySelector("p").textContent = caption.textContent;
      imageDialog.showModal();
    });
    [commandDialog, imageDialog].forEach((dialog) =>
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          dialog.close();
        }
      }),
    );
    [commandDialog, imageDialog].forEach((dialog) =>
      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const r = dialog.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          dialog.close();
      }),
    );
  }
}
