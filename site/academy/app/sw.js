/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-6f24ce2334f0e59a3d67";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-CztLJklP.css","/academy/app/assets/index-DoEq9yN9.js","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-CCa4pyls.js","/academy/app/workstation/assets/AgentScene-VeL_GqdD.js","/academy/app/workstation/assets/AmmScene-B5jqFsz4.js","/academy/app/workstation/assets/AuthScene-kP6eQwiJ.js","/academy/app/workstation/assets/AuthorityScene-DfAHKo7c.js","/academy/app/workstation/assets/BookScene-DKYwdzsn.js","/academy/app/workstation/assets/ClaimsScene-CyWAXX0y.js","/academy/app/workstation/assets/ControlScene-B-eo_Rgv.js","/academy/app/workstation/assets/CredentialsScene-B-tz_peG.js","/academy/app/workstation/assets/DeskScene-BTuX5_MQ.js","/academy/app/workstation/assets/DomainsScene-CeerLpTu.js","/academy/app/workstation/assets/GardenScene-Cn70UKng.js","/academy/app/workstation/assets/Gated-DFBd19Uu.js","/academy/app/workstation/assets/HistoryScene-CC0Z_oCC.js","/academy/app/workstation/assets/InvestigateIssuerButton-Cqzxnhvw.js","/academy/app/workstation/assets/IssuanceScene-CxtL2Qpx.js","/academy/app/workstation/assets/LearnScene-BGszIyQI.js","/academy/app/workstation/assets/LedgerWatchScene-DDG98OD9.js","/academy/app/workstation/assets/LegalScene-CiqJYmKf.js","/academy/app/workstation/assets/MissionControlScene-yphoUlMc.js","/academy/app/workstation/assets/NetworkScene-ef_oawoF.js","/academy/app/workstation/assets/NftScene-DvjXpLvf.js","/academy/app/workstation/assets/PassportScene-DxvyADhy.js","/academy/app/workstation/assets/PlansScene-C_ERkWvT.js","/academy/app/workstation/assets/ProvenanceScene-Zm5qL_uJ.js","/academy/app/workstation/assets/RevenueScene-swSo27f1.js","/academy/app/workstation/assets/RiskScene-DG2DoXoL.js","/academy/app/workstation/assets/SafeShopScene-OK8znnty.js","/academy/app/workstation/assets/SecurityScene-oyoYHiHe.js","/academy/app/workstation/assets/SettingsScene-BQFISPst.js","/academy/app/workstation/assets/SettlementScene-Tk9rod__.js","/academy/app/workstation/assets/Signal-CWbxNyLM.js","/academy/app/workstation/assets/TrustScene-Bh29nyVj.js","/academy/app/workstation/assets/WorkstationScene-DCc0VdjN.js","/academy/app/workstation/assets/_virtual_noshx-pages-Bzjh7gK8.js","/academy/app/workstation/assets/amm-BGN2q47j.js","/academy/app/workstation/assets/authority-LaRAAAmN.js","/academy/app/workstation/assets/book-DHxh34SY.js","/academy/app/workstation/assets/claims-DfoiYJs0.js","/academy/app/workstation/assets/control-Ch-x2nQB.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-Bo0eUdr6.js","/academy/app/workstation/assets/deposit-D__0567E.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BHPmInpc.js","/academy/app/workstation/assets/index-BS95PE4Z.css","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Cax4j1lU.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-CllTYzBl.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/investigate-abhdFkyX.js","/academy/app/workstation/assets/issuance-Dn3p82O7.js","/academy/app/workstation/assets/ledgerWatch-CGFZ4xog.js","/academy/app/workstation/assets/live-Y-i43T_0.js","/academy/app/workstation/assets/nft-ClAwAjFy.js","/academy/app/workstation/assets/provenance-CnLAPgfy.js","/academy/app/workstation/assets/registry-Bo3a3T8c.js","/academy/app/workstation/assets/sanctions-BLJXh50o.js","/academy/app/workstation/assets/settlement-CaO4SSGy.js","/academy/app/workstation/assets/surveillance-CXvjRXEM.js","/academy/app/workstation/assets/tabs-BL8Re1SR.js","/academy/app/workstation/assets/threats-ChlnTxgj.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
