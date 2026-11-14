import { useEffect, useState } from "react";
export function UpdateNotice() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const notify = () => setReady(true);
    window.addEventListener("academy-update-ready", notify);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .getRegistration()
        .then((r) => {
          if (r?.waiting) setReady(true);
        })
        .catch(() => {});
    return () => window.removeEventListener("academy-update-ready", notify);
  }, []);
  return ready ? (
    <aside className="learning-offline" role="status">
      A validated course bundle is ready. Your local progress, review schedule
      and certificates stay on this device.{" "}
      <button
        onClick={() => window.dispatchEvent(new Event("academy-apply-update"))}
      >
        Update &amp; resume
      </button>
    </aside>
  ) : null;
}
