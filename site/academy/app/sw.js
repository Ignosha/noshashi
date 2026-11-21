/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-5cc4d11db6aeafee1914";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-H4Vdi5z0.js","/academy/app/assets/index-Nt1mZ41A.css","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-BYFEB6rE.js","/academy/app/workstation/assets/AgentScene-B-BVSw3I.js","/academy/app/workstation/assets/AmmScene-CAO48FF2.js","/academy/app/workstation/assets/AuthScene-BFT6-Itb.js","/academy/app/workstation/assets/AuthorityScene-CEzayGK1.js","/academy/app/workstation/assets/BookScene-BFo-CqDY.js","/academy/app/workstation/assets/ClaimsScene-Xn9k1eCc.js","/academy/app/workstation/assets/ControlScene-xXoObfhD.js","/academy/app/workstation/assets/CredentialsScene-CONq_z4M.js","/academy/app/workstation/assets/DeskScene-fy1NRjx3.js","/academy/app/workstation/assets/DomainsScene-DPAkT6U4.js","/academy/app/workstation/assets/GardenScene-BiTibQcG.js","/academy/app/workstation/assets/Gated-CmGtzCDC.js","/academy/app/workstation/assets/HistoryScene-gz1LH22T.js","/academy/app/workstation/assets/InvestigateIssuerButton-SU59o0RN.js","/academy/app/workstation/assets/IssuanceScene-8g411NeK.js","/academy/app/workstation/assets/LearnScene-DLwOkW6E.js","/academy/app/workstation/assets/LedgerWatchScene-DlIg0nQM.js","/academy/app/workstation/assets/LegalScene-BnBZQDOD.js","/academy/app/workstation/assets/MissionControlScene-CTlwRtPf.js","/academy/app/workstation/assets/NetworkScene-Bu4PhyZ7.js","/academy/app/workstation/assets/NftScene-_gZq3Fz8.js","/academy/app/workstation/assets/PassportScene-opAOKriI.js","/academy/app/workstation/assets/PlansScene-DghwD-jT.js","/academy/app/workstation/assets/ProvenanceScene-Bc1bJ4v5.js","/academy/app/workstation/assets/RevenueScene-BdwKsKvQ.js","/academy/app/workstation/assets/RiskScene-cEYw1JFp.js","/academy/app/workstation/assets/SafeShopScene-3N7YSE9S.js","/academy/app/workstation/assets/SecurityScene-DBwf_6mc.js","/academy/app/workstation/assets/SettingsScene-hj88w_ue.js","/academy/app/workstation/assets/SettlementScene-2E8oOQPN.js","/academy/app/workstation/assets/Signal-CqFvdG05.js","/academy/app/workstation/assets/TrustScene-2XHZBymK.js","/academy/app/workstation/assets/WorkstationScene-CWDqw7Yk.js","/academy/app/workstation/assets/_virtual_noshx-pages-BMuM20-X.js","/academy/app/workstation/assets/amm-BKbaT0j0.js","/academy/app/workstation/assets/authority-DKtJWSDy.js","/academy/app/workstation/assets/book-DRcQ25ED.js","/academy/app/workstation/assets/claims-Fs7_kRmn.js","/academy/app/workstation/assets/control-C5hpj6pt.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-DmPiGcbH.js","/academy/app/workstation/assets/deposit-ZhdlrYhG.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-BcscMnPJ.js","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CEj2YdPF.js","/academy/app/workstation/assets/index-CHt5neQy.css","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/index-Dr5Iwvmu.js","/academy/app/workstation/assets/investigate-luWVwQMn.js","/academy/app/workstation/assets/issuance-BfnMGRkg.js","/academy/app/workstation/assets/ledgerWatch-CdPjxwm6.js","/academy/app/workstation/assets/live-Bey4MwyM.js","/academy/app/workstation/assets/nft-gbl6rd9x.js","/academy/app/workstation/assets/provenance-BykMpl4B.js","/academy/app/workstation/assets/registry-C55EwSUf.js","/academy/app/workstation/assets/sanctions-UDIREAua.js","/academy/app/workstation/assets/settlement-DKzBf_16.js","/academy/app/workstation/assets/surveillance-CRLiYZa9.js","/academy/app/workstation/assets/tabs-DELGvauK.js","/academy/app/workstation/assets/threats-DkN_NtzE.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
