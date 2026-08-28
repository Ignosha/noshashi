import { isTauri } from "./env";

/**
 * Open a URL in the operator's real browser.
 *
 * Checkout and the billing portal must run on Stripe's own domain, not
 * inside our webview — a payment form rendered by us is a payment form
 * we could be accused of reading. The native layer refuses anything that
 * is not plain http(s).
 */
export async function openExternal(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Refusing to open a non-web URL.");
  }

  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external", { url: parsed.toString() });
    return;
  }

  window.open(parsed.toString(), "_blank", "noopener,noreferrer");
}
