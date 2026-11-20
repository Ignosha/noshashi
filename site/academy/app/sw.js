/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-253fa8dca2ead4c596eb";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-CztLJklP.css","/academy/app/assets/index-DoEq9yN9.js","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-rWWIHoU0.js","/academy/app/workstation/assets/AgentScene-ztGj7BEt.js","/academy/app/workstation/assets/AmmScene-D0wwb5Mp.js","/academy/app/workstation/assets/AuthScene-Ca9rcodW.js","/academy/app/workstation/assets/AuthorityScene-zTxWm0Ih.js","/academy/app/workstation/assets/BookScene-CwDkr05K.js","/academy/app/workstation/assets/ClaimsScene-eRpV-YpN.js","/academy/app/workstation/assets/ControlScene-DtJujNKo.js","/academy/app/workstation/assets/CredentialsScene-CzhD9Yr4.js","/academy/app/workstation/assets/DeskScene-DPOTS0hz.js","/academy/app/workstation/assets/DomainsScene-zecrkras.js","/academy/app/workstation/assets/GardenScene-Qqs0ibQj.js","/academy/app/workstation/assets/Gated-VYs1-uO8.js","/academy/app/workstation/assets/HistoryScene-8m9XKV4L.js","/academy/app/workstation/assets/InvestigateIssuerButton-DZiyu1Bh.js","/academy/app/workstation/assets/IssuanceScene-C3zwzGCd.js","/academy/app/workstation/assets/LearnScene-C-bNakpV.js","/academy/app/workstation/assets/LedgerWatchScene-Bw_XpHgB.js","/academy/app/workstation/assets/LegalScene-B5b5RR9U.js","/academy/app/workstation/assets/MissionControlScene-BVbsXRsK.js","/academy/app/workstation/assets/NetworkScene-DVP4Zqba.js","/academy/app/workstation/assets/NftScene-Dcibi7oR.js","/academy/app/workstation/assets/PassportScene-Da-LUQIa.js","/academy/app/workstation/assets/PlansScene-DafdtGm2.js","/academy/app/workstation/assets/ProvenanceScene-ButnbE7j.js","/academy/app/workstation/assets/RevenueScene-CzDVcebw.js","/academy/app/workstation/assets/RiskScene-KmajRwOb.js","/academy/app/workstation/assets/SafeShopScene-CmbdTfQ1.js","/academy/app/workstation/assets/SecurityScene-BRacUOpy.js","/academy/app/workstation/assets/SettingsScene-CvIF9dtv.js","/academy/app/workstation/assets/SettlementScene-DJR9l4OP.js","/academy/app/workstation/assets/Signal-Boc3TzCG.js","/academy/app/workstation/assets/TrustScene-CuNPSChj.js","/academy/app/workstation/assets/WorkstationScene-BbAG7QSu.js","/academy/app/workstation/assets/_virtual_noshx-pages-Csf0-Y6C.js","/academy/app/workstation/assets/amm-CHYBRZgL.js","/academy/app/workstation/assets/authority-B1QK3Kgv.js","/academy/app/workstation/assets/book-ZhRjRGV_.js","/academy/app/workstation/assets/claims-DHryTJFz.js","/academy/app/workstation/assets/control-CCcR4clS.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-CnyZzr8I.js","/academy/app/workstation/assets/deposit-B8AdmFFs.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BS95PE4Z.css","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-DUPxd6Dm.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-QOiDgNLK.js","/academy/app/workstation/assets/index-lIF1CDa_.js","/academy/app/workstation/assets/investigate-CIHy1eF6.js","/academy/app/workstation/assets/issuance-CbS3kvrT.js","/academy/app/workstation/assets/ledgerWatch-S2ZOoYlX.js","/academy/app/workstation/assets/live-BByAJY4Z.js","/academy/app/workstation/assets/nft-CEImP0-V.js","/academy/app/workstation/assets/provenance-CCG3r0ZI.js","/academy/app/workstation/assets/registry-CJyz5-5Y.js","/academy/app/workstation/assets/sanctions-Ch0sxkgl.js","/academy/app/workstation/assets/settlement-C-4tjgf_.js","/academy/app/workstation/assets/surveillance-BUZlV-fc.js","/academy/app/workstation/assets/tabs-DcbBVFyc.js","/academy/app/workstation/assets/threats-U27HseD7.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
