import { useEffect, useState } from "react";
export function StorageNotice() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem("academy.storage-check", "1");
      localStorage.removeItem("academy.storage-check");
    } catch {
      setBlocked(true);
    }
    const warn = () => setBlocked(true);
    window.addEventListener("academy-save-unavailable", warn);
    return () => window.removeEventListener("academy-save-unavailable", warn);
  }, []);
  return blocked ? (
    <aside className="learning-offline" role="status">
      Device storage is unavailable. You can learn in this tab, but progress
      cannot survive a reload or closed tab. No server copy is being saved.
    </aside>
  ) : null;
}
