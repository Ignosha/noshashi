/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-4ca9ec95e59a3281b650";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-BL9kLiRq.css","/academy/app/assets/index-Byagu8i9.js","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-BSewnBvw.js","/academy/app/workstation/assets/AgentScene-Br03pm8Y.js","/academy/app/workstation/assets/AmmScene-LHW5h1y5.js","/academy/app/workstation/assets/AuthScene-ojJL07ys.js","/academy/app/workstation/assets/AuthorityScene-CWjnRRwc.js","/academy/app/workstation/assets/BookScene-BUK9cAEJ.js","/academy/app/workstation/assets/ClaimsScene-Bl9VN0eL.js","/academy/app/workstation/assets/ControlScene-Y7-r1Kab.js","/academy/app/workstation/assets/CredentialsScene-CUDR2nZv.js","/academy/app/workstation/assets/DeskScene-r5z2T56M.js","/academy/app/workstation/assets/DomainsScene-Cw8OofFY.js","/academy/app/workstation/assets/GardenScene-CnYDuj89.js","/academy/app/workstation/assets/Gated-Ccx4CKzq.js","/academy/app/workstation/assets/HistoryScene-NsjuxyrM.js","/academy/app/workstation/assets/InvestigateIssuerButton-D_Zva825.js","/academy/app/workstation/assets/IssuanceScene-D5Xr0LnV.js","/academy/app/workstation/assets/LearnScene-DNU9nalP.js","/academy/app/workstation/assets/LedgerWatchScene-D78bK4Nx.js","/academy/app/workstation/assets/LegalScene-BT8sco8a.js","/academy/app/workstation/assets/MissionControlScene-Bze7BK8V.js","/academy/app/workstation/assets/NetworkScene-6S2XvZ2A.js","/academy/app/workstation/assets/NftScene-DWW_OkTJ.js","/academy/app/workstation/assets/PassportScene-C2qjGa2M.js","/academy/app/workstation/assets/PlansScene-Bw1FYiIm.js","/academy/app/workstation/assets/ProvenanceScene-C0GUwWpT.js","/academy/app/workstation/assets/RevenueScene-3ax3T1UD.js","/academy/app/workstation/assets/RiskScene-CbLG9I5X.js","/academy/app/workstation/assets/SafeShopScene-DSKsFAnq.js","/academy/app/workstation/assets/SecurityScene-DJLd4ieE.js","/academy/app/workstation/assets/SettingsScene-BoXZFguO.js","/academy/app/workstation/assets/SettlementScene-L_QZzwZp.js","/academy/app/workstation/assets/Signal-C8CmmUf6.js","/academy/app/workstation/assets/TrustScene-BuO5KCFH.js","/academy/app/workstation/assets/WorkstationScene-CZyz740f.js","/academy/app/workstation/assets/_virtual_noshx-pages-D90Jn5fA.js","/academy/app/workstation/assets/amm-Dho_VDR-.js","/academy/app/workstation/assets/authority-pzFSQJlB.js","/academy/app/workstation/assets/book-BfWO1Bon.js","/academy/app/workstation/assets/claims-B8SQ2j34.js","/academy/app/workstation/assets/control-Bmu8-C22.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-CTJOJWCb.js","/academy/app/workstation/assets/deposit-G3w6pRwq.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-Bab6G26p.js","/academy/app/workstation/assets/index-BgJbwXsj.css","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-DzATpWzJ.js","/academy/app/workstation/assets/index-uq6Iz6vJ.js","/academy/app/workstation/assets/investigate-C2DejpzR.js","/academy/app/workstation/assets/issuance-DSJ6LXsv.js","/academy/app/workstation/assets/ledgerWatch-D7J3Jmi_.js","/academy/app/workstation/assets/live-LmROPyEJ.js","/academy/app/workstation/assets/nft-DlAdl8lJ.js","/academy/app/workstation/assets/provenance-zau5Sktz.js","/academy/app/workstation/assets/registry-M26LrzKS.js","/academy/app/workstation/assets/sanctions-B0I6yYfX.js","/academy/app/workstation/assets/settlement-DKBYqpH9.js","/academy/app/workstation/assets/surveillance-BPIT_J6C.js","/academy/app/workstation/assets/tabs-BwjQ4pda.js","/academy/app/workstation/assets/threats-BNpnMAb8.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
