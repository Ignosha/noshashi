/* Generated with a content hash and complete core/workstation asset list.
 * A failed precache never activates. Existing clients opt in to a consistent reload.
 * Progress/certificates live in localStorage, which this worker never touches.
 */
const CACHE = "noshashi-academy-9c7906c65bfe0bbafa26";
const PRECACHE = ["/academy/app/app-icon.svg","/academy/app/assets/atkinson-hyperlegible-latin-400-normal-BKTgBNmI.woff2","/academy/app/assets/atkinson-hyperlegible-latin-700-normal-BriLmxM2.woff2","/academy/app/assets/core-DV6XEvTN.js","/academy/app/assets/index-CztLJklP.css","/academy/app/assets/index-DoEq9yN9.js","/academy/app/index.html","/academy/app/manifest.webmanifest","/academy/app/workstation/app-icon.svg","/academy/app/workstation/assets/AccountScene-K7QeAXKm.js","/academy/app/workstation/assets/AgentScene-eXVZ5PsA.js","/academy/app/workstation/assets/AmmScene-JGlGFkvP.js","/academy/app/workstation/assets/AuthScene-B1twYc7l.js","/academy/app/workstation/assets/AuthorityScene-D-5lmLoM.js","/academy/app/workstation/assets/BookScene-DqjDvcnr.js","/academy/app/workstation/assets/ClaimsScene-Ka-Ma91z.js","/academy/app/workstation/assets/ControlScene-CnxpLLv_.js","/academy/app/workstation/assets/CredentialsScene-D9-rS18p.js","/academy/app/workstation/assets/DeskScene-DWlI9rxw.js","/academy/app/workstation/assets/DomainsScene-C6eVeqpq.js","/academy/app/workstation/assets/GardenScene-BpQCi1Km.js","/academy/app/workstation/assets/Gated-Ch5cvfGg.js","/academy/app/workstation/assets/HistoryScene-DbEGdNVH.js","/academy/app/workstation/assets/InvestigateIssuerButton-D_-oce9h.js","/academy/app/workstation/assets/IssuanceScene-MVNBbxQH.js","/academy/app/workstation/assets/LearnScene-DjrVp20_.js","/academy/app/workstation/assets/LedgerWatchScene-Cq4M3o4c.js","/academy/app/workstation/assets/LegalScene-B1Bl509M.js","/academy/app/workstation/assets/MissionControlScene-up89w-ep.js","/academy/app/workstation/assets/NetworkScene-CHhXq2Ln.js","/academy/app/workstation/assets/NftScene-BjIKPbm4.js","/academy/app/workstation/assets/PassportScene-Id8Ni31G.js","/academy/app/workstation/assets/PlansScene-D4e2Q9An.js","/academy/app/workstation/assets/ProvenanceScene-DX9bZO_V.js","/academy/app/workstation/assets/RevenueScene-BLVRj8fF.js","/academy/app/workstation/assets/RiskScene-Cw63gCLf.js","/academy/app/workstation/assets/SafeShopScene-fac6c1ID.js","/academy/app/workstation/assets/SecurityScene-Bhb9MHHc.js","/academy/app/workstation/assets/SettingsScene-CbmJOhh7.js","/academy/app/workstation/assets/SettlementScene-Bie8Me51.js","/academy/app/workstation/assets/Signal-C9EMv58p.js","/academy/app/workstation/assets/TrustScene-DgN6cx46.js","/academy/app/workstation/assets/WorkstationScene-O3Uh3ibl.js","/academy/app/workstation/assets/_virtual_noshx-pages-DzJVhz7b.js","/academy/app/workstation/assets/amm-B4LcMl7W.js","/academy/app/workstation/assets/authority-6VUxxm7u.js","/academy/app/workstation/assets/book-mPmg5Iw-.js","/academy/app/workstation/assets/claims-esY89xT3.js","/academy/app/workstation/assets/control-HNgv4cUj.js","/academy/app/workstation/assets/core-DhEqZVGG.js","/academy/app/workstation/assets/counterparty-DZlmJ657.js","/academy/app/workstation/assets/deposit-D8gz0qOr.js","/academy/app/workstation/assets/event-C9aqpjCI.js","/academy/app/workstation/assets/index-B1Dy7oyt.js","/academy/app/workstation/assets/index-BS95PE4Z.css","/academy/app/workstation/assets/index-BlPnH21l.js","/academy/app/workstation/assets/index-Btfm_Iy6.js","/academy/app/workstation/assets/index-C6vaIspU.js","/academy/app/workstation/assets/index-CLSJ4cO9.js","/academy/app/workstation/assets/index-CUIkBP30.js","/academy/app/workstation/assets/index-Ce7DLMSL.js","/academy/app/workstation/assets/index-DMOuHg1M.js","/academy/app/workstation/assets/index-DWAWkcyj.js","/academy/app/workstation/assets/investigate-HVX3NnfK.js","/academy/app/workstation/assets/issuance-CQqmWEga.js","/academy/app/workstation/assets/ledgerWatch-CjE5AYwy.js","/academy/app/workstation/assets/live-AXYQEK8O.js","/academy/app/workstation/assets/nft-D--7nGC2.js","/academy/app/workstation/assets/provenance-D0Hjzu9a.js","/academy/app/workstation/assets/registry-DiqunX8R.js","/academy/app/workstation/assets/sanctions-DPL3y230.js","/academy/app/workstation/assets/settlement-D17w3HFB.js","/academy/app/workstation/assets/surveillance-ByHE8mVN.js","/academy/app/workstation/assets/tabs-CHDR8NqB.js","/academy/app/workstation/assets/threats-6j_8GJjI.js","/academy/app/workstation/assets/window-CC_fwzcp.js","/academy/app/workstation/index.html"];
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
