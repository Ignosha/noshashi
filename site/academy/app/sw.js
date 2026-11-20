/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-ddd9532065eeeb55da03";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-CztLJklP.css","/academy/app/assets/index-DoEq9yN9.js","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-BXEdz6PH.js","/academy/app/workstation/assets/AgentScene-B0ixxrlZ.js","/academy/app/workstation/assets/AmmScene-BAUJo6sC.js","/academy/app/workstation/assets/AuthScene-Dk5o3y97.js","/academy/app/workstation/assets/AuthorityScene-DXziB5FE.js","/academy/app/workstation/assets/BookScene-Cp8PYBV0.js","/academy/app/workstation/assets/ClaimsScene-CPdyHn6c.js","/academy/app/workstation/assets/ControlScene-hdQTL7SC.js","/academy/app/workstation/assets/CredentialsScene-ClMoSaKu.js","/academy/app/workstation/assets/DeskScene-BOqyix6i.js","/academy/app/workstation/assets/DomainsScene-Ds5Z-jBX.js","/academy/app/workstation/assets/GardenScene-CaMf_VHa.js","/academy/app/workstation/assets/Gated-bixIz6pq.js","/academy/app/workstation/assets/HistoryScene-BPzsoD1c.js","/academy/app/workstation/assets/InvestigateIssuerButton-BVxAyiKB.js","/academy/app/workstation/assets/IssuanceScene-BtNrHKrb.js","/academy/app/workstation/assets/LearnScene-DXbvQ4Ih.js","/academy/app/workstation/assets/LedgerWatchScene-8AZUiCGV.js","/academy/app/workstation/assets/LegalScene-0-Q4doAZ.js","/academy/app/workstation/assets/MissionControlScene-BBwC_a5-.js","/academy/app/workstation/assets/NetworkScene-kkwXUUvX.js","/academy/app/workstation/assets/NftScene-C_kRzrDu.js","/academy/app/workstation/assets/PassportScene-B1IkJ81X.js","/academy/app/workstation/assets/PlansScene-BnmnkIrU.js","/academy/app/workstation/assets/ProvenanceScene-Dx0BKcHN.js","/academy/app/workstation/assets/RevenueScene-u0IwiwBv.js","/academy/app/workstation/assets/RiskScene-CbwmAEm1.js","/academy/app/workstation/assets/SafeShopScene-CgV_U31n.js","/academy/app/workstation/assets/SecurityScene-CH_S7pNt.js","/academy/app/workstation/assets/SettingsScene-Cft_PeT_.js","/academy/app/workstation/assets/SettlementScene-2JX_M0dd.js","/academy/app/workstation/assets/Signal-D141nHXC.js","/academy/app/workstation/assets/TrustScene-BbHVRAoY.js","/academy/app/workstation/assets/WorkstationScene-B8oEbt6P.js","/academy/app/workstation/assets/_virtual_noshx-pages-CqpL3NCg.js","/academy/app/workstation/assets/amm-BGYT1JSn.js","/academy/app/workstation/assets/authority-CDSScNjR.js","/academy/app/workstation/assets/book-UTeXA9Lw.js","/academy/app/workstation/assets/claims-DCsuMzTN.js","/academy/app/workstation/assets/control-DhTb0b_d.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-DYGL-QDo.js","/academy/app/workstation/assets/deposit-DCJ6E0X9.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BS95PE4Z.css","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-DN-Vi8MT.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-DauzSU14.js","/academy/app/workstation/assets/index-DiXWyuaF.js","/academy/app/workstation/assets/investigate-DWRGTBEA.js","/academy/app/workstation/assets/issuance-O3_FbvT6.js","/academy/app/workstation/assets/ledgerWatch-CsSbwBoq.js","/academy/app/workstation/assets/live-tNUYV846.js","/academy/app/workstation/assets/nft-2PwIx6_R.js","/academy/app/workstation/assets/provenance-Cr2n6JLt.js","/academy/app/workstation/assets/registry-DvRCw9qb.js","/academy/app/workstation/assets/sanctions-Bu2jA7mo.js","/academy/app/workstation/assets/settlement-CLEBo2nr.js","/academy/app/workstation/assets/surveillance-BXsDsgCY.js","/academy/app/workstation/assets/tabs-C4J6GSrd.js","/academy/app/workstation/assets/threats-BDcZ3-zb.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
