/**
 * Offline support for the website version (/academy/app/).
 *
 * The desktop app carries everything it needs. On the website, a small
 * service worker keeps a copy of the Academy's own files after the first
 * visit, so the course opens and works with no connection. It touches only
 * same-origin GET requests under /academy/app/; videos and the live ledger
 * are left to the network.
 */
import { isTauri } from "@/lib/env";

export function registerOffline(): void {
  if (isTauri || !("serviceWorker" in navigator) || !location.pathname.startsWith("/academy/app/")) return;
  navigator.serviceWorker.register("/academy/app/sw.js", { scope: "/academy/app/" }).catch(() => {
    // Not fatal: the Academy works online without it.
  });
}
