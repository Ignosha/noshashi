export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** navigator.platform is deprecated but still the most reliable signal here. */
export const isMac =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/**
 * The menu bar HUD and the full console are the same bundle rendered
 * into two different Tauri windows; the query string selects which.
 */
export const isTrayView =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("view") === "tray";
