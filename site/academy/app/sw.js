/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-49cc80548d9c8561f467";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-CztLJklP.css","/academy/app/assets/index-DoEq9yN9.js","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-Dhl1hmrr.js","/academy/app/workstation/assets/AgentScene-BObUvJrL.js","/academy/app/workstation/assets/AmmScene-BiG4qRZ0.js","/academy/app/workstation/assets/AuthScene-CLm6UVAS.js","/academy/app/workstation/assets/AuthorityScene-c7uXc5Qy.js","/academy/app/workstation/assets/BookScene-LiU9bTMp.js","/academy/app/workstation/assets/ClaimsScene-C4s5U-j3.js","/academy/app/workstation/assets/ControlScene-BDcRDOuS.js","/academy/app/workstation/assets/CredentialsScene-DYWSujvq.js","/academy/app/workstation/assets/DeskScene-BQxFrfRG.js","/academy/app/workstation/assets/DomainsScene-kK5eaVpI.js","/academy/app/workstation/assets/GardenScene-D-2KBtX4.js","/academy/app/workstation/assets/Gated-BD0LTmL_.js","/academy/app/workstation/assets/HistoryScene-CWScN-HU.js","/academy/app/workstation/assets/InvestigateIssuerButton-DSxfh47t.js","/academy/app/workstation/assets/IssuanceScene-ajGBqRQo.js","/academy/app/workstation/assets/LearnScene-D5zQUzhj.js","/academy/app/workstation/assets/LedgerWatchScene-C02bOr5j.js","/academy/app/workstation/assets/LegalScene-C6SXTL4s.js","/academy/app/workstation/assets/MissionControlScene-uIfVnpZ0.js","/academy/app/workstation/assets/NetworkScene-8_3pYGI_.js","/academy/app/workstation/assets/NftScene-Blh2QL2t.js","/academy/app/workstation/assets/PassportScene-CwK-irDw.js","/academy/app/workstation/assets/PlansScene-CTKeuvZp.js","/academy/app/workstation/assets/ProvenanceScene-BN3ZbcW4.js","/academy/app/workstation/assets/RevenueScene-U-GnWrgx.js","/academy/app/workstation/assets/RiskScene-BfS_eszW.js","/academy/app/workstation/assets/SafeShopScene-YHBk2mIR.js","/academy/app/workstation/assets/SecurityScene-Br71xV9p.js","/academy/app/workstation/assets/SettingsScene-CcUGCnl2.js","/academy/app/workstation/assets/SettlementScene-CK8qpE_7.js","/academy/app/workstation/assets/Signal-C9sPv6Yx.js","/academy/app/workstation/assets/TrustScene-IUEv0stk.js","/academy/app/workstation/assets/WorkstationScene-D7bt6Q9X.js","/academy/app/workstation/assets/_virtual_noshx-pages-BMuM20-X.js","/academy/app/workstation/assets/amm-DtVvkZiJ.js","/academy/app/workstation/assets/authority-JFcrNW33.js","/academy/app/workstation/assets/book-C9bvl5sq.js","/academy/app/workstation/assets/claims-DUtRdW9p.js","/academy/app/workstation/assets/control-f6cBkxEv.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-DMzW3dRH.js","/academy/app/workstation/assets/deposit-C3rhcygT.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BS95PE4Z.css","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-D6Q0sNNE.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-WSNSTITu.js","/academy/app/workstation/assets/index-xpun4Zlk.js","/academy/app/workstation/assets/investigate-BPt-0R7v.js","/academy/app/workstation/assets/issuance-DXaBJXFA.js","/academy/app/workstation/assets/ledgerWatch-Dfc114wo.js","/academy/app/workstation/assets/live-BUtMnF7b.js","/academy/app/workstation/assets/nft-BBKzvzfM.js","/academy/app/workstation/assets/provenance-DwJ2a2jp.js","/academy/app/workstation/assets/registry-Vy1tyBsO.js","/academy/app/workstation/assets/sanctions-B5lxSQ_f.js","/academy/app/workstation/assets/settlement-C5Zr9Ent.js","/academy/app/workstation/assets/surveillance-EknfYyyc.js","/academy/app/workstation/assets/tabs-CwL8coH_.js","/academy/app/workstation/assets/threats-Df5TlKlD.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
