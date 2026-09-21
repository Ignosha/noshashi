import { isTauri } from "./env";
import { readSetting } from "./store";

export type NotificationPayload = {
  title: string;
  body?: string;
};

/**
 * Send a native notification.
 *
 * Uses tauri-plugin-notification on the desktop (requesting permission
 * once, on first use) and the Web Notifications API in the browser.
 * Honours the user's notification preference — callers do not need to
 * check it themselves.
 */
export async function sendNativeNotification(
  payload: NotificationPayload
): Promise<void> {
  const enabled = await readSetting("notifications.enabled", true);
  if (!enabled) return;

  if (isTauri) {
    try {
      const {
        sendNotification,
        isPermissionGranted,
        requestPermission,
      } = await import("@tauri-apps/plugin-notification");

      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === "granted";
      }
      if (!granted) return;

      sendNotification({
        title: payload.title,
        body: payload.body,
      });
      return;
    } catch (error) {
      console.error("Native notification failed", error);
      return;
    }
  }

  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(payload.title, { body: payload.body });
    return;
  }
  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(payload.title, { body: payload.body });
    }
  }
}
