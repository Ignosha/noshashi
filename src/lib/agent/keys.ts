import { isTauri } from "@/lib/env";

/**
 * Model-provider API keys.
 *
 * Held in the OS keyring, one entry per provider, so a key never lands
 * in a preferences file or in browser storage. The web view can store,
 * check and clear a key but never read one back: model requests are made
 * in Rust (src-tauri/src/model_proxy.rs), which adds the key itself. In
 * the browser build there is no keyring, and remote providers are
 * refused rather than falling back to localStorage.
 */

export async function storeProviderKey(provider: string, key: string): Promise<void> {
  if (!isTauri) {
    throw new Error(
      "Storing an API key requires the desktop app, which has an OS keyring. The browser build supports local runtimes only."
    );
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("store_provider_key", { provider, key });
}

export async function hasProviderKey(provider: string): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<boolean>("has_provider_key", { provider });
}

export async function clearProviderKey(provider: string): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("clear_provider_key", { provider });
}
