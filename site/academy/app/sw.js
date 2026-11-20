/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-0263208c6df710f174e1";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-CztLJklP.css","/academy/app/assets/index-DoEq9yN9.js","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-Docvd0Qd.js","/academy/app/workstation/assets/AgentScene-BNWS4HuW.js","/academy/app/workstation/assets/AmmScene-DouIueAS.js","/academy/app/workstation/assets/AuthScene-rDhiqRdd.js","/academy/app/workstation/assets/AuthorityScene-DuK6X6yS.js","/academy/app/workstation/assets/BookScene-X0yVaAwh.js","/academy/app/workstation/assets/ClaimsScene-eLltuiHJ.js","/academy/app/workstation/assets/ControlScene-ltJ47NLD.js","/academy/app/workstation/assets/CredentialsScene-CBoUTnyN.js","/academy/app/workstation/assets/DeskScene-DZ6oWfgj.js","/academy/app/workstation/assets/DomainsScene-CoINldmM.js","/academy/app/workstation/assets/GardenScene-GsBmwUOB.js","/academy/app/workstation/assets/Gated-sCl5TfN1.js","/academy/app/workstation/assets/HistoryScene-4CszlK_Q.js","/academy/app/workstation/assets/InvestigateIssuerButton-B43V4npl.js","/academy/app/workstation/assets/IssuanceScene-DjzfCtWZ.js","/academy/app/workstation/assets/LearnScene-CWdmfrCB.js","/academy/app/workstation/assets/LedgerWatchScene-DLyZ2OxK.js","/academy/app/workstation/assets/LegalScene-DDSmLLhS.js","/academy/app/workstation/assets/MissionControlScene-B43v_iGu.js","/academy/app/workstation/assets/NetworkScene-CrTZGRbU.js","/academy/app/workstation/assets/NftScene-Q74pnrBP.js","/academy/app/workstation/assets/PassportScene-CuLIUXDT.js","/academy/app/workstation/assets/PlansScene-BrdiLJoS.js","/academy/app/workstation/assets/ProvenanceScene-A33TJCsn.js","/academy/app/workstation/assets/RevenueScene-CVBTOKT5.js","/academy/app/workstation/assets/RiskScene-B99_3qI6.js","/academy/app/workstation/assets/SafeShopScene-5e8C4fqi.js","/academy/app/workstation/assets/SecurityScene-D1U4FhYO.js","/academy/app/workstation/assets/SettingsScene-CDWX17Xp.js","/academy/app/workstation/assets/SettlementScene-BQrqaVO6.js","/academy/app/workstation/assets/Signal-BoUFfxtn.js","/academy/app/workstation/assets/TrustScene-CRkj9pAE.js","/academy/app/workstation/assets/WorkstationScene-C5kSuQ3e.js","/academy/app/workstation/assets/_virtual_noshx-pages-Cip15Ha_.js","/academy/app/workstation/assets/amm-QvCkx-EP.js","/academy/app/workstation/assets/authority-BEuybEhe.js","/academy/app/workstation/assets/book-y0H61Xsc.js","/academy/app/workstation/assets/claims-B1SGaeci.js","/academy/app/workstation/assets/control-CtaxFEXX.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-5QkRs9KQ.js","/academy/app/workstation/assets/deposit-_MMCQM3l.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BS95PE4Z.css","/academy/app/workstation/assets/index-BZq7JBCM.js","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-Cy3cbS82.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-O0T8wU1H.js","/academy/app/workstation/assets/investigate-vnqiGaHm.js","/academy/app/workstation/assets/issuance-pT1Oiftz.js","/academy/app/workstation/assets/ledgerWatch-CFMQoy4J.js","/academy/app/workstation/assets/live-CvzAjCSv.js","/academy/app/workstation/assets/nft-Co0-upAR.js","/academy/app/workstation/assets/provenance-_ZDAaVY3.js","/academy/app/workstation/assets/registry-RxXJxrsL.js","/academy/app/workstation/assets/sanctions-C6XvWGwm.js","/academy/app/workstation/assets/settlement-DzUM_JBo.js","/academy/app/workstation/assets/surveillance-CrBQXH1X.js","/academy/app/workstation/assets/tabs-B31oBNLi.js","/academy/app/workstation/assets/threats-BKYAJOMy.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
