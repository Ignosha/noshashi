/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-bb415c93c2ad2010fdfa";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-H4Vdi5z0.js","/academy/app/assets/index-Nt1mZ41A.css","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-CSfjvv0i.js","/academy/app/workstation/assets/AgentScene-iik1Bp20.js","/academy/app/workstation/assets/AmmScene-DfkKSpdJ.js","/academy/app/workstation/assets/AuthScene-CguyBr49.js","/academy/app/workstation/assets/AuthorityScene-DSREqbum.js","/academy/app/workstation/assets/BookScene-BzF6gPyz.js","/academy/app/workstation/assets/ClaimsScene-F7C2iX52.js","/academy/app/workstation/assets/ControlScene-SKB3B_ZM.js","/academy/app/workstation/assets/CredentialsScene-DgnTnFIH.js","/academy/app/workstation/assets/DeskScene-BGq3hiWK.js","/academy/app/workstation/assets/DomainsScene-DMQJajlD.js","/academy/app/workstation/assets/GardenScene-BYNRpj7a.js","/academy/app/workstation/assets/Gated-BwVIuvNT.js","/academy/app/workstation/assets/HistoryScene-CcXYzYBj.js","/academy/app/workstation/assets/InvestigateIssuerButton-D7xbRxbh.js","/academy/app/workstation/assets/IssuanceScene-aVtWV0_E.js","/academy/app/workstation/assets/LearnScene-DHiZm_17.js","/academy/app/workstation/assets/LedgerWatchScene-DJcX1CMy.js","/academy/app/workstation/assets/LegalScene-DXh9LGzY.js","/academy/app/workstation/assets/MissionControlScene-BcrgFwLg.js","/academy/app/workstation/assets/NetworkScene-B-TU0icc.js","/academy/app/workstation/assets/NftScene-DCqe7FIK.js","/academy/app/workstation/assets/PassportScene-CXPpbuoV.js","/academy/app/workstation/assets/PlansScene-B_Mp31oz.js","/academy/app/workstation/assets/ProvenanceScene-D7lPWNVB.js","/academy/app/workstation/assets/RevenueScene-DPGtDVxO.js","/academy/app/workstation/assets/RiskScene-FkFT0Is4.js","/academy/app/workstation/assets/SafeShopScene-OHEAkKUc.js","/academy/app/workstation/assets/SecurityScene-DbumSGUR.js","/academy/app/workstation/assets/SettingsScene-K9ZsdzC2.js","/academy/app/workstation/assets/SettlementScene-DvoKGBat.js","/academy/app/workstation/assets/Signal-CsLqCXiY.js","/academy/app/workstation/assets/TrustScene-BjhyEYa8.js","/academy/app/workstation/assets/WorkstationScene-BN-gqNlN.js","/academy/app/workstation/assets/_virtual_noshx-pages-BMuM20-X.js","/academy/app/workstation/assets/amm-DBEYiXJh.js","/academy/app/workstation/assets/authority-NOheeCrI.js","/academy/app/workstation/assets/book-qDRbj9v1.js","/academy/app/workstation/assets/claims-BlBRoc9M.js","/academy/app/workstation/assets/control-DTWRb80Q.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-Bp8G0Cvl.js","/academy/app/workstation/assets/deposit-CXqt7oFk.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-Cgdop-gR.js","/academy/app/workstation/assets/index-CkjSJ4Xf.css","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-F1GJr6P1.js","/academy/app/workstation/assets/index-Um5UtDPj.js","/academy/app/workstation/assets/investigate-GF76sO01.js","/academy/app/workstation/assets/issuance-DLF5Atmb.js","/academy/app/workstation/assets/ledgerWatch-CDHT6A8O.js","/academy/app/workstation/assets/live-C7uWn9sG.js","/academy/app/workstation/assets/nft-BJBJttvh.js","/academy/app/workstation/assets/provenance-DJ-RJxah.js","/academy/app/workstation/assets/registry-Cps8rj83.js","/academy/app/workstation/assets/sanctions-D3VE78aN.js","/academy/app/workstation/assets/settlement-B5hfN_Xa.js","/academy/app/workstation/assets/surveillance-CR0akFCe.js","/academy/app/workstation/assets/tabs-z8p3Ruoc.js","/academy/app/workstation/assets/threats-Bv4iSdCk.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
