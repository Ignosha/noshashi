import { isTauri } from "./env";

/**
 * Save a generated text file (the audit trail) to disk.
 *
 * On the desktop a Rust command writes into ~/Downloads and returns the
 * real path, because a webview `<a download>` is unreliable inside a
 * Tauri window. In the browser the Blob path is used instead.
 * Returns a human-readable destination for the confirmation toast.
 */
export async function saveTextFile(
  filename: string,
  contents: string,
  mimeType = "text/csv"
): Promise<string> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("export_text_file", { filename, contents });
  }

  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has claimed the URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
