import { useState } from "react";
import { isTauri } from "@/lib/env";
import { useLocal } from "./useLocal";

/**
 * On an iPhone or iPad in Safari, how to install the Academy: Share, then
 * Add to Home Screen. It then opens full screen with its own icon and works
 * offline, like an app. Not shown in the desktop or iOS apps, once
 * installed, or after it is dismissed.
 */
function onIosSafari(): boolean {
  if (isTauri || typeof navigator === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
  return ios && !installed;
}

export function InstallHint() {
  const [dismissed, setDismissed] = useLocal("academy.installHint", false);
  const [show] = useState(onIosSafari);
  if (!show || dismissed) return null;
  return (
    <aside aria-label="Install the Academy" className="flex items-start gap-3 border-b border-brand/30 bg-brand/5 px-5 py-2.5 text-[12.5px]">
      <p className="flex-1">
        <strong>Install it on this {/iPhone|iPod/.test(navigator.userAgent) ? "iPhone" : "iPad"}:</strong> tap{" "}
        <span aria-label="the Share button">Share</span> (the square with an arrow), then <strong>Add to Home Screen</strong>. The Academy then opens full screen
        with its own icon, and keeps working offline.
      </p>
      <button type="button" onClick={() => setDismissed(true)} className="font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground hover:text-brand">
        NOT NOW
      </button>
    </aside>
  );
}
