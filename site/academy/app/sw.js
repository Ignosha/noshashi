/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-25e499a57ceec7367241";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-CztLJklP.css","/academy/app/assets/index-DoEq9yN9.js","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-fJiO1pRN.js","/academy/app/workstation/assets/AgentScene-D5ogGH1M.js","/academy/app/workstation/assets/AmmScene-7rjoWaND.js","/academy/app/workstation/assets/AuthScene-AJhQxIAv.js","/academy/app/workstation/assets/AuthorityScene-Bv9x8SQe.js","/academy/app/workstation/assets/BookScene-B7wOHc2i.js","/academy/app/workstation/assets/ClaimsScene-CYo0QALD.js","/academy/app/workstation/assets/ControlScene-DhpUIlkm.js","/academy/app/workstation/assets/CredentialsScene-BHpWGPUi.js","/academy/app/workstation/assets/DeskScene-D4WdMTlr.js","/academy/app/workstation/assets/DomainsScene-DB5bNwmk.js","/academy/app/workstation/assets/GardenScene-BEC_nbrP.js","/academy/app/workstation/assets/Gated-CtFNdLzV.js","/academy/app/workstation/assets/HistoryScene-CnJb46I5.js","/academy/app/workstation/assets/InvestigateIssuerButton-DYLTd5lo.js","/academy/app/workstation/assets/IssuanceScene-BOSfMCsj.js","/academy/app/workstation/assets/LearnScene-C50tRqKV.js","/academy/app/workstation/assets/LedgerWatchScene-CQS5i1Rq.js","/academy/app/workstation/assets/LegalScene-VsGsxL7z.js","/academy/app/workstation/assets/MissionControlScene-_yhhqWO-.js","/academy/app/workstation/assets/NetworkScene-DBaRUSDc.js","/academy/app/workstation/assets/NftScene-Dq7uqVtR.js","/academy/app/workstation/assets/PassportScene-DICJxcLN.js","/academy/app/workstation/assets/PlansScene-C9Ab5tl1.js","/academy/app/workstation/assets/ProvenanceScene-IGWc-G-s.js","/academy/app/workstation/assets/RevenueScene-MZEpXIoN.js","/academy/app/workstation/assets/RiskScene-CPSSilYx.js","/academy/app/workstation/assets/SafeShopScene-CnqlqxnH.js","/academy/app/workstation/assets/SecurityScene-lk-Cor3k.js","/academy/app/workstation/assets/SettingsScene-CoEu0DR6.js","/academy/app/workstation/assets/SettlementScene-Cs5h_0Ph.js","/academy/app/workstation/assets/Signal-BwXr1wU9.js","/academy/app/workstation/assets/TrustScene-lZwU1j37.js","/academy/app/workstation/assets/WorkstationScene-BU079_ZO.js","/academy/app/workstation/assets/_virtual_noshx-pages-Br2E5Dut.js","/academy/app/workstation/assets/amm-BDsdavqF.js","/academy/app/workstation/assets/authority-CMsE5Xro.js","/academy/app/workstation/assets/book-ZluN-4V5.js","/academy/app/workstation/assets/claims-C3ogqyp1.js","/academy/app/workstation/assets/control-Cp0tD66n.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-CUOzqo-h.js","/academy/app/workstation/assets/deposit-D5bBhK17.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BS95PE4Z.css","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CCbnXDBB.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-D8Uq2Amf.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-DfoZ3Gtw.js","/academy/app/workstation/assets/investigate-B2UAPA50.js","/academy/app/workstation/assets/issuance-63tLcRUl.js","/academy/app/workstation/assets/ledgerWatch-BhQDzVbv.js","/academy/app/workstation/assets/live-mDQrhk_j.js","/academy/app/workstation/assets/nft-DuZ33Ie8.js","/academy/app/workstation/assets/provenance-CVCRbT4J.js","/academy/app/workstation/assets/registry-T8nGGywP.js","/academy/app/workstation/assets/sanctions-bh9duS83.js","/academy/app/workstation/assets/settlement-D_q41YlB.js","/academy/app/workstation/assets/surveillance-cNIqVXRC.js","/academy/app/workstation/assets/tabs-CbKM6tFg.js","/academy/app/workstation/assets/threats-BQ0Gn6VU.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_VALIDATED_ACADEMY") self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = (await caches.keys()).filter((k) =>
        k.startsWith("noshashi-academy-"),
      );
      const previous = keys.filter((k) => k !== CACHE).at(-1);
      await Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== previous)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== location.origin ||
    !url.pathname.startsWith("/academy/app/") ||
    request.headers.has("range")
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (request.mode === "navigate") {
        const shell = url.pathname.startsWith("/academy/app/workstation/")
          ? "/academy/app/workstation/index.html"
          : "/academy/app/index.html";
        return (await cache.match(shell)) || fetch(request);
      }
      const pinned = await cache.match(request);
      if (pinned) return pinned;
      try {
        return await fetch(request);
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })(),
  );
});
