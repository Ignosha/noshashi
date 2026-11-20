/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-1787700271253d5d55a6";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-CztLJklP.css","/academy/app/assets/index-DoEq9yN9.js","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-PRSeCRAR.js","/academy/app/workstation/assets/AgentScene-BlkP9qQ9.js","/academy/app/workstation/assets/AmmScene-Cv_jXVMa.js","/academy/app/workstation/assets/AuthScene-Bvl4eLdt.js","/academy/app/workstation/assets/AuthorityScene-D0SoprXS.js","/academy/app/workstation/assets/BookScene-DGHOCWym.js","/academy/app/workstation/assets/ClaimsScene-D2iT1UNE.js","/academy/app/workstation/assets/ControlScene-8JCwtZo3.js","/academy/app/workstation/assets/CredentialsScene-CyAutwAB.js","/academy/app/workstation/assets/DeskScene-BrqDHo2d.js","/academy/app/workstation/assets/DomainsScene-cNf1MjKw.js","/academy/app/workstation/assets/GardenScene-vOlrCon8.js","/academy/app/workstation/assets/Gated-cqLYk-2r.js","/academy/app/workstation/assets/HistoryScene-YlOnuPEG.js","/academy/app/workstation/assets/InvestigateIssuerButton-DqobKCHl.js","/academy/app/workstation/assets/IssuanceScene-BtL8VKkO.js","/academy/app/workstation/assets/LearnScene-BaPLun34.js","/academy/app/workstation/assets/LedgerWatchScene-DV2H0H0M.js","/academy/app/workstation/assets/LegalScene-CbXz8SV_.js","/academy/app/workstation/assets/MissionControlScene-DNVxF8rU.js","/academy/app/workstation/assets/NetworkScene-r9psVu-X.js","/academy/app/workstation/assets/NftScene-7pc3v8MG.js","/academy/app/workstation/assets/PassportScene-BA_yCC3J.js","/academy/app/workstation/assets/PlansScene-SVBx2IRp.js","/academy/app/workstation/assets/ProvenanceScene-X5vslA4G.js","/academy/app/workstation/assets/RevenueScene-C7t3OCeW.js","/academy/app/workstation/assets/RiskScene-dblR5qIE.js","/academy/app/workstation/assets/SafeShopScene-SexmfK1O.js","/academy/app/workstation/assets/SecurityScene-DwvE_mxu.js","/academy/app/workstation/assets/SettingsScene-CMS4I_LF.js","/academy/app/workstation/assets/SettlementScene-DLkWF9CL.js","/academy/app/workstation/assets/Signal-BSXCFS_u.js","/academy/app/workstation/assets/TrustScene-DSwNxfV7.js","/academy/app/workstation/assets/WorkstationScene-B-ltyTjf.js","/academy/app/workstation/assets/_virtual_noshx-pages-CiDZwIpo.js","/academy/app/workstation/assets/amm-DsWw7OH_.js","/academy/app/workstation/assets/authority-CLxw_im5.js","/academy/app/workstation/assets/book-C3__hsP8.js","/academy/app/workstation/assets/claims-GmffAdmg.js","/academy/app/workstation/assets/control-BFDaM2pl.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-6twtQtNz.js","/academy/app/workstation/assets/deposit-qM9m109B.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BS95PE4Z.css","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-BsdRDYfE.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-DBxSjvua.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-DzqktLP7.js","/academy/app/workstation/assets/investigate-jBrwLWxo.js","/academy/app/workstation/assets/issuance-Boq__onm.js","/academy/app/workstation/assets/ledgerWatch-BwYM52Id.js","/academy/app/workstation/assets/live-tZ72EVig.js","/academy/app/workstation/assets/nft-w3c-VTvo.js","/academy/app/workstation/assets/provenance-CO2aPVT_.js","/academy/app/workstation/assets/registry-DVc4Gut5.js","/academy/app/workstation/assets/sanctions-ChGTD7xc.js","/academy/app/workstation/assets/settlement-BeICcWGs.js","/academy/app/workstation/assets/surveillance-DRKULnbC.js","/academy/app/workstation/assets/tabs-BWrXlJa3.js","/academy/app/workstation/assets/threats-CaEqIVeS.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
