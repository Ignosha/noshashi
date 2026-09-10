import { BRAND } from "./brand";
import { isTauri } from "./env";
import { readSetting, writeSetting } from "./store";

/**
 * Signed in-place updates.
 *
 * The application is published unsigned and un-notarised, which is stated
 * plainly on every release page. That makes the update path the part of
 * this that has to be right: an updater which simply downloads whatever a
 * URL serves would be a straightforward way to replace a compliance tool
 * with something else on every desk that runs it.
 *
 * So nothing here trusts the release host. tauri-plugin-updater verifies a
 * minisign signature over the downloaded bundle against the public key
 * compiled into the application, and refuses to install anything that does
 * not verify. The private key never leaves the release pipeline. A
 * compromised GitHub account can therefore serve a bad file, and every
 * installed copy will decline it.
 *
 * Two further rules, both deliberate:
 *
 *   - Nothing installs without a person saying so. An adjudication tool
 *     that silently changes the rule set underneath a receipt already
 *     issued is not one an examiner can rely on. Checking is automatic;
 *     installing is a click.
 *   - A build with no public key does not offer the feature at all. It
 *     reports that updates are unconfigured rather than showing a control
 *     that cannot work. See docs/UPDATES.md.
 */

/** How often a background check may run, at most. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // six hours
const LAST_CHECK_KEY = "updates.lastCheckedAt";

export const AUTO_CHECK_KEY = "updates.autoCheck";

export type UpdateAvailability =
  | { state: "unsupported"; reason: string }
  | { state: "unconfigured"; reason: string }
  | { state: "current"; version: string }
  | { state: "available"; version: string; notes?: string; date?: string }
  | { state: "error"; reason: string };

export type UpdateProgress = {
  /** Bytes written so far, and the total when the server declared one. */
  downloaded: number;
  total?: number;
};

type PluginUpdate = {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall: (
    onEvent: (event: {
      event: "Started" | "Progress" | "Finished";
      data?: { contentLength?: number; chunkLength?: number };
    }) => void
  ) => Promise<void>;
};

/**
 * The pending update, held between the check and the install.
 *
 * The plugin's handle is not serialisable, so it cannot live in React
 * state alongside the rest of the status. It is module-scoped instead, and
 * cleared whenever a check runs again so an install can never apply a
 * handle from an earlier, superseded check.
 */
let pending: PluginUpdate | null = null;

/** Whether this build was compiled with an updater public key. */
export async function updatesConfigured(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("updater_configured");
  } catch {
    return false;
  }
}

/**
 * Ask the release channel what the current version is.
 *
 * Errors are returned rather than thrown: an unreachable release host is an
 * ordinary condition on a desk behind a proxy, and it must not read to the
 * operator as though the ledger or the policy engine were in trouble.
 */
export async function checkForUpdate(): Promise<UpdateAvailability> {
  pending = null;

  if (!isTauri) {
    return {
      state: "unsupported",
      reason: "Updates apply to the desktop application.",
    };
  }
  if (!(await updatesConfigured())) {
    return {
      state: "unconfigured",
      reason: "This build carries no update signing key, so it cannot verify one.",
    };
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = (await check()) as PluginUpdate | null;
    await writeSetting(LAST_CHECK_KEY, Date.now());

    if (!update) return { state: "current", version: BRAND.version };

    pending = update;
    return {
      state: "available",
      version: update.version,
      notes: update.body,
      date: update.date,
    };
  } catch (error) {
    return {
      state: "error",
      reason: error instanceof Error ? error.message : "Could not reach the release channel.",
    };
  }
}

/**
 * Download, verify and install the update found by the last check, then
 * restart into it.
 *
 * The signature check happens inside `downloadAndInstall` — it rejects
 * before anything is written if the bundle was not signed by the key this
 * build was compiled with.
 */
export async function installPendingUpdate(
  onProgress?: (progress: UpdateProgress) => void
): Promise<void> {
  if (!pending) {
    throw new Error("No update has been found to install. Check again first.");
  }

  let downloaded = 0;
  let total: number | undefined;

  await pending.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data?.contentLength;
      onProgress?.({ downloaded: 0, total });
      return;
    }
    if (event.event === "Progress") {
      downloaded += event.data?.chunkLength ?? 0;
      onProgress?.({ downloaded, total });
      return;
    }
    if (event.event === "Finished") {
      onProgress?.({ downloaded: total ?? downloaded, total });
    }
  });

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/**
 * The startup check.
 *
 * Rate-limited against a stored timestamp so launching the app repeatedly
 * does not mean a request per launch, and silent about everything except
 * an update actually being available — a release host that is down is not
 * news the operator needs on the way in.
 */
export async function checkOnStartup(): Promise<UpdateAvailability | null> {
  if (!isTauri) return null;
  if (!(await readSetting(AUTO_CHECK_KEY, true))) return null;

  const last = await readSetting<number>(LAST_CHECK_KEY, 0);
  if (Date.now() - last < CHECK_INTERVAL_MS) return null;

  const result = await checkForUpdate();
  return result.state === "available" ? result : null;
}
