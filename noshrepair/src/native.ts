/**
 * The one thing NOSHREPAIR asks of its native shell: open a prefilled
 * GitHub issue in the browser. The shell checks the address itself
 * (src-tauri/src/lib.rs) and opens nothing else, so even a compromised
 * page cannot use it to launch arbitrary links or programs.
 */
export const ISSUE_PREFIX = "https://github.com/Ignosha/noshashi/issues/new?";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function openIssue(url: string): Promise<void> {
  if (!url.startsWith(ISSUE_PREFIX)) throw new Error("NOSHREPAIR only opens new GitHub issues for NOSHASHI.");
  if (inTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_issue", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
