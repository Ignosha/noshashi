import { isTauri } from "@/lib/env";
export function registerOffline(): void {
  if (
    isTauri ||
    !("serviceWorker" in navigator) ||
    !location.pathname.startsWith("/academy/app/")
  )
    return;
  let requested = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (requested) location.reload();
  });
  window.addEventListener("academy-apply-update", () => {
    void navigator.serviceWorker
      .getRegistration("/academy/app/")
      .then((registration) => {
        if (registration?.waiting) {
          requested = true;
          registration.waiting.postMessage({
            type: "ACTIVATE_VALIDATED_ACADEMY",
          });
        }
      })
      .catch(() => {});
  });
  void navigator.serviceWorker
    .register("/academy/app/sw.js", {
      scope: "/academy/app/",
      updateViaCache: "none",
    })
    .then((registration) => {
      const notify = () => {
        if (registration.waiting && navigator.serviceWorker.controller)
          window.dispatchEvent(new Event("academy-update-ready"));
      };
      notify();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", notify);
      });
    })
    .catch(() => {
      /* Course works online; a failed candidate retains the active worker. */
    });
}
