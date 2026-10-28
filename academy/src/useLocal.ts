import { useCallback, useState } from "react";

/**
 * State kept in this computer's browser storage. The Academy stores only
 * the learner's own progress and settings, and nothing leaves the device.
 * Storage can be refused (a locked-down machine), so every read and write
 * is guarded and the app still works for the session.
 */
export function useLocal<T>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage refused: progress lasts for this session only.
      }
    },
    [key]
  );
  return [value, set];
}
