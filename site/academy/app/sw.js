/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-71673cec2ca9f200df97";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-B-GNyPPN.js","/academy/app/assets/index-CztLJklP.css","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-DmWf-uNM.js","/academy/app/workstation/assets/AgentScene-OYE6ss0M.js","/academy/app/workstation/assets/AmmScene-nwjwsUco.js","/academy/app/workstation/assets/AuthScene-CHQ4Gcl6.js","/academy/app/workstation/assets/AuthorityScene-DPF4Lkaa.js","/academy/app/workstation/assets/BookScene-D7vTxqVr.js","/academy/app/workstation/assets/ClaimsScene-CqIwiC4r.js","/academy/app/workstation/assets/ControlScene-CpK83yMs.js","/academy/app/workstation/assets/CredentialsScene-DXKvT3Es.js","/academy/app/workstation/assets/DeskScene-tsPTatgC.js","/academy/app/workstation/assets/DomainsScene-CCxLWZ7R.js","/academy/app/workstation/assets/GardenScene-TDuUu609.js","/academy/app/workstation/assets/Gated-C0bjSPhT.js","/academy/app/workstation/assets/HistoryScene-kLalGNpm.js","/academy/app/workstation/assets/InvestigateIssuerButton-B3oWjc6K.js","/academy/app/workstation/assets/IssuanceScene-CfcBkOCO.js","/academy/app/workstation/assets/LearnScene-CDBC17WF.js","/academy/app/workstation/assets/LedgerWatchScene-BHuC82NZ.js","/academy/app/workstation/assets/LegalScene-Dlw66YNq.js","/academy/app/workstation/assets/MissionControlScene-DU09Xfgz.js","/academy/app/workstation/assets/NetworkScene-BhJV9HJq.js","/academy/app/workstation/assets/NftScene-Sy8EhlFr.js","/academy/app/workstation/assets/PassportScene-QlpZGiCq.js","/academy/app/workstation/assets/PlansScene-CkdstBTb.js","/academy/app/workstation/assets/ProvenanceScene-DGEDHRBG.js","/academy/app/workstation/assets/RevenueScene-CQQGCR9s.js","/academy/app/workstation/assets/RiskScene-mrcJUqss.js","/academy/app/workstation/assets/SafeShopScene-Dm8_3r2e.js","/academy/app/workstation/assets/SecurityScene-DhTfaEyq.js","/academy/app/workstation/assets/SettingsScene-BUF5fADe.js","/academy/app/workstation/assets/SettlementScene-CCdVpw2r.js","/academy/app/workstation/assets/Signal-D9rVVDv1.js","/academy/app/workstation/assets/TrustScene-B8TfwXjy.js","/academy/app/workstation/assets/WorkstationScene-DgC7YrF6.js","/academy/app/workstation/assets/_virtual_noshx-pages-DzJVhz7b.js","/academy/app/workstation/assets/amm-BCPmC3CI.js","/academy/app/workstation/assets/authority-Cq-e2sBE.js","/academy/app/workstation/assets/book--_vyW0zg.js","/academy/app/workstation/assets/claims-1K6wbN7H.js","/academy/app/workstation/assets/control-C0NbCOpt.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-uK5Jpfoe.js","/academy/app/workstation/assets/deposit-D92XYKRd.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BS95PE4Z.css","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-BxLXKFk6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-DhznQdoy.js","/academy/app/workstation/assets/index-WtSiCe6y.js","/academy/app/workstation/assets/investigate-PA4dHQjx.js","/academy/app/workstation/assets/issuance-BLIRQndI.js","/academy/app/workstation/assets/ledgerWatch-DyhBtsc-.js","/academy/app/workstation/assets/live-B8-cFflf.js","/academy/app/workstation/assets/nft-CEvTn0bk.js","/academy/app/workstation/assets/provenance-wmcMqb-_.js","/academy/app/workstation/assets/registry-CjZqbf9i.js","/academy/app/workstation/assets/sanctions-Cy-Po2pD.js","/academy/app/workstation/assets/settlement-DhM8I9aZ.js","/academy/app/workstation/assets/surveillance-CXTAHsJw.js","/academy/app/workstation/assets/tabs-DBwZ6qWU.js","/academy/app/workstation/assets/threats-BmAOA85s.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
