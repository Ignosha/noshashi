import { isTauri } from "@/lib/env";
import { readSetting } from "@/lib/store";
export type TreasuryNotificationStatus =
  | "submitted"
  | "permission_required"
  | "disabled"
  | "unavailable"
  | "failed";
/** Submission is not proof that a person received/read a notification. No wallet data on lock screens. */
export async function notifyTreasury(
  count: number,
  requestPermission = false,
): Promise<TreasuryNotificationStatus> {
  if (!(await readSetting("notifications.enabled", true))) return "disabled";
  const title = requestPermission
    ? "NOSHASHI · Notification test"
    : "NOSHASHI · Treasury review";
  const body = requestPermission
    ? "Notification test submitted. This is not a payment alert."
    : `${count} new treasury review item(s). Open Treasury Guard to inspect evidence. No transfer was stopped or reversed.`;
  try {
    if (isTauri) {
      const n = await import("@tauri-apps/plugin-notification");
      let granted = await n.isPermissionGranted();
      if (!granted && requestPermission)
        granted = (await n.requestPermission()) === "granted";
      if (!granted) return "permission_required";
      n.sendNotification({ title, body });
      return "submitted";
    }
    if (typeof Notification === "undefined") return "unavailable";
    let permission = Notification.permission;
    if (permission === "default" && requestPermission)
      permission = await Notification.requestPermission();
    if (permission !== "granted") return "permission_required";
    new Notification(title, { body });
    return "submitted";
  } catch {
    return "failed";
  }
}
