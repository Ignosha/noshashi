/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-750c169b5e7cb78ff244";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-CztLJklP.css","/academy/app/assets/index-DoEq9yN9.js","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-B_RW3_p9.js","/academy/app/workstation/assets/AgentScene-B6nmluHH.js","/academy/app/workstation/assets/AmmScene-XoByammy.js","/academy/app/workstation/assets/AuthScene-BrybrbFX.js","/academy/app/workstation/assets/AuthorityScene-CfXX4Tlp.js","/academy/app/workstation/assets/BookScene-CXdO12AV.js","/academy/app/workstation/assets/ClaimsScene-OGVOheQ1.js","/academy/app/workstation/assets/ControlScene-CxRRsS7K.js","/academy/app/workstation/assets/CredentialsScene-WYJSBrd5.js","/academy/app/workstation/assets/DeskScene-CS_nItal.js","/academy/app/workstation/assets/DomainsScene-DL4BLi1R.js","/academy/app/workstation/assets/GardenScene-CIGlEHMK.js","/academy/app/workstation/assets/Gated-DnlDT5-N.js","/academy/app/workstation/assets/HistoryScene-BU7fksoj.js","/academy/app/workstation/assets/InvestigateIssuerButton-GIWXryqn.js","/academy/app/workstation/assets/IssuanceScene-Di30Ms94.js","/academy/app/workstation/assets/LearnScene-tkYL6P2O.js","/academy/app/workstation/assets/LedgerWatchScene-BaefPXa-.js","/academy/app/workstation/assets/LegalScene-DxiMn-Qk.js","/academy/app/workstation/assets/MissionControlScene-ffcwZx8u.js","/academy/app/workstation/assets/NetworkScene-65zEDtdQ.js","/academy/app/workstation/assets/NftScene-DpfGd6bk.js","/academy/app/workstation/assets/PassportScene--rvqNslh.js","/academy/app/workstation/assets/PlansScene-BDwucirX.js","/academy/app/workstation/assets/ProvenanceScene-V9v8FZs0.js","/academy/app/workstation/assets/RevenueScene-CnNgOkfz.js","/academy/app/workstation/assets/RiskScene-BniaMLrX.js","/academy/app/workstation/assets/SafeShopScene-CtjicaVv.js","/academy/app/workstation/assets/SecurityScene-Bx2kYHdg.js","/academy/app/workstation/assets/SettingsScene-Bxfoa14R.js","/academy/app/workstation/assets/SettlementScene-C5sqI--z.js","/academy/app/workstation/assets/Signal-BJrgvkSy.js","/academy/app/workstation/assets/TrustScene-y7HOZY0v.js","/academy/app/workstation/assets/WorkstationScene-Dreaz9AP.js","/academy/app/workstation/assets/_virtual_noshx-pages-CB9uUi3S.js","/academy/app/workstation/assets/amm-iMnI4D_d.js","/academy/app/workstation/assets/authority-D9PaOMrB.js","/academy/app/workstation/assets/book-BkxzusOg.js","/academy/app/workstation/assets/claims-C3_g_7t4.js","/academy/app/workstation/assets/control-B8DYE2BW.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-EZhtd6j7.js","/academy/app/workstation/assets/deposit-BOYzCD3g.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BS95PE4Z.css","/academy/app/workstation/assets/index-BbqbU3l8.js","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CHWqYdTA.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-Df_5tqsK.js","/academy/app/workstation/assets/investigate-CcJbsFA4.js","/academy/app/workstation/assets/issuance-DuONb4f2.js","/academy/app/workstation/assets/ledgerWatch-BUSG3_a_.js","/academy/app/workstation/assets/live-DM9kdxx5.js","/academy/app/workstation/assets/nft-DKAqu11T.js","/academy/app/workstation/assets/provenance-C-2XJOHR.js","/academy/app/workstation/assets/registry-B9E__kQg.js","/academy/app/workstation/assets/sanctions-88VTL4JZ.js","/academy/app/workstation/assets/settlement-D34-xrRM.js","/academy/app/workstation/assets/surveillance-DUYgWNpA.js","/academy/app/workstation/assets/tabs-viTfnKnC.js","/academy/app/workstation/assets/threats-CmwDmPoh.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
