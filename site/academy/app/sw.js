/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-957afc240e9c5d6f7a5d";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-H4Vdi5z0.js","/academy/app/assets/index-Nt1mZ41A.css","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-DP6aC8O3.js","/academy/app/workstation/assets/AgentScene-D-1F3n3J.js","/academy/app/workstation/assets/AmmScene-BR1giPxu.js","/academy/app/workstation/assets/AuthScene-BagmxbqF.js","/academy/app/workstation/assets/AuthorityScene-C2d8qPuU.js","/academy/app/workstation/assets/BookScene-BTNEzpCw.js","/academy/app/workstation/assets/ClaimsScene-Mk9o9_gu.js","/academy/app/workstation/assets/ControlScene-CU89mqWv.js","/academy/app/workstation/assets/CredentialsScene-C2ERJsfy.js","/academy/app/workstation/assets/DeskScene-D5NyxE5M.js","/academy/app/workstation/assets/DomainsScene-CI2wXEH2.js","/academy/app/workstation/assets/GardenScene-DOd6Z3Vt.js","/academy/app/workstation/assets/Gated-BMHFjdyw.js","/academy/app/workstation/assets/HistoryScene-DF6nfZh6.js","/academy/app/workstation/assets/InvestigateIssuerButton-CuoRsiWf.js","/academy/app/workstation/assets/IssuanceScene-CRimzt9p.js","/academy/app/workstation/assets/LearnScene-Bdh_IjVG.js","/academy/app/workstation/assets/LedgerWatchScene-CtuGp3Db.js","/academy/app/workstation/assets/LegalScene-B7OjB8Vo.js","/academy/app/workstation/assets/MissionControlScene-DAoX0n6d.js","/academy/app/workstation/assets/NetworkScene-Cy_D5KOC.js","/academy/app/workstation/assets/NftScene-DwVCiAEW.js","/academy/app/workstation/assets/PassportScene-m_G3yudl.js","/academy/app/workstation/assets/PlansScene-CJJD1C6d.js","/academy/app/workstation/assets/ProvenanceScene-BEp9Q1rQ.js","/academy/app/workstation/assets/RevenueScene-CYTKDsbM.js","/academy/app/workstation/assets/RiskScene-DQ635jJD.js","/academy/app/workstation/assets/SafeShopScene-BjVuLFrg.js","/academy/app/workstation/assets/SecurityScene-H3DU11dw.js","/academy/app/workstation/assets/SettingsScene-FEVogrcm.js","/academy/app/workstation/assets/SettlementScene-DsdOnxnJ.js","/academy/app/workstation/assets/Signal-D-HRC_si.js","/academy/app/workstation/assets/TrustScene-BmZ2TiI0.js","/academy/app/workstation/assets/WorkstationScene-DqCaZ0rl.js","/academy/app/workstation/assets/_virtual_noshx-pages-BMuM20-X.js","/academy/app/workstation/assets/amm-1kUxY3Wr.js","/academy/app/workstation/assets/authority-Dhiy_Q3Z.js","/academy/app/workstation/assets/book-Dw__tgq4.js","/academy/app/workstation/assets/claims-CuGB0SEQ.js","/academy/app/workstation/assets/control-C0lG94ni.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-BFLM6Jys.js","/academy/app/workstation/assets/deposit-DVnFAupn.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-8MVcOJQ0.css","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CIQPCgBV.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-DIRL-Ado.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-s2bNQtLU.js","/academy/app/workstation/assets/investigate-HItPAH94.js","/academy/app/workstation/assets/issuance-DWZjPYLG.js","/academy/app/workstation/assets/ledgerWatch-BgNO57KM.js","/academy/app/workstation/assets/live-Bf3ifAuj.js","/academy/app/workstation/assets/nft-BKuO9sIT.js","/academy/app/workstation/assets/provenance-DKftOtK2.js","/academy/app/workstation/assets/registry-LHKgYFDV.js","/academy/app/workstation/assets/sanctions-vyL81wg8.js","/academy/app/workstation/assets/settlement-CK7y9RrD.js","/academy/app/workstation/assets/surveillance-DvqT6csT.js","/academy/app/workstation/assets/tabs-BcjT_Lrs.js","/academy/app/workstation/assets/threats-uKZHRuKB.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
