/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-aa37b722904562e0e73d";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-JcZAbFmy.js","/academy/app/assets/index-Nt1mZ41A.css","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-B1y7H9dm.js","/academy/app/workstation/assets/AgentScene-BfPWd2zh.js","/academy/app/workstation/assets/AmmScene-GOjD0TpM.js","/academy/app/workstation/assets/AuthScene-DJUEtdtf.js","/academy/app/workstation/assets/AuthorityScene-Bi6IQhL5.js","/academy/app/workstation/assets/BookScene-BNKSC8RM.js","/academy/app/workstation/assets/ClaimsScene-BeiBFtHt.js","/academy/app/workstation/assets/ControlScene-C628Wudq.js","/academy/app/workstation/assets/CredentialsScene-DDJ7cJ_F.js","/academy/app/workstation/assets/DeskScene-D1U_Ktu1.js","/academy/app/workstation/assets/DomainsScene-3Upe5K3J.js","/academy/app/workstation/assets/GardenScene-DZsXKVfE.js","/academy/app/workstation/assets/Gated-D0qtiR73.js","/academy/app/workstation/assets/HistoryScene-TxHkEd7y.js","/academy/app/workstation/assets/InvestigateIssuerButton-DisaSV66.js","/academy/app/workstation/assets/IssuanceScene-BvuGtKF4.js","/academy/app/workstation/assets/LearnScene-T-nsSa29.js","/academy/app/workstation/assets/LedgerWatchScene-BU8Dpovb.js","/academy/app/workstation/assets/LegalScene-CQYPT4zW.js","/academy/app/workstation/assets/MissionControlScene-CfFpulsL.js","/academy/app/workstation/assets/NetworkScene-Z4qAI-8x.js","/academy/app/workstation/assets/NftScene-Cent7X96.js","/academy/app/workstation/assets/PassportScene-CCrGt1ZK.js","/academy/app/workstation/assets/PlansScene-fvH-2seD.js","/academy/app/workstation/assets/ProvenanceScene-DIX7Gepx.js","/academy/app/workstation/assets/RevenueScene-Dn157iPS.js","/academy/app/workstation/assets/RiskScene-Dc4eK5Pa.js","/academy/app/workstation/assets/SafeShopScene-JmoL7jdo.js","/academy/app/workstation/assets/SecurityScene-D8tJ2aUv.js","/academy/app/workstation/assets/SettingsScene-DUYCd25k.js","/academy/app/workstation/assets/SettlementScene-BL1SYIQU.js","/academy/app/workstation/assets/Signal-B-zFr1Ay.js","/academy/app/workstation/assets/TrustScene-DYwW6igR.js","/academy/app/workstation/assets/WorkstationScene-abGgC15l.js","/academy/app/workstation/assets/_virtual_noshx-pages-BMuM20-X.js","/academy/app/workstation/assets/amm-CraVs5QD.js","/academy/app/workstation/assets/authority-DmyZb05s.js","/academy/app/workstation/assets/book-CgsaJnEJ.js","/academy/app/workstation/assets/claims-BMSbzYPd.js","/academy/app/workstation/assets/control-DZ3h6qhM.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-CsurMkn2.js","/academy/app/workstation/assets/deposit-CI7k22-b.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-0QZ7pHpM.js","/academy/app/workstation/assets/index-8MVcOJQ0.css","/academy/app/workstation/assets/index-Bicnj22V.js","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-DJz5YV88.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/investigate-DkeFep7-.js","/academy/app/workstation/assets/issuance-DcZYeO73.js","/academy/app/workstation/assets/ledgerWatch-CMhaC4C6.js","/academy/app/workstation/assets/live-ClHA_0zA.js","/academy/app/workstation/assets/nft-CpoiwgJB.js","/academy/app/workstation/assets/provenance-PF4Y24pR.js","/academy/app/workstation/assets/registry-C2dFSgKk.js","/academy/app/workstation/assets/sanctions-CCR9mLnd.js","/academy/app/workstation/assets/settlement-H471slhC.js","/academy/app/workstation/assets/surveillance-CASFVT_p.js","/academy/app/workstation/assets/tabs-RavcLK0-.js","/academy/app/workstation/assets/threats-_FHE_kPE.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
