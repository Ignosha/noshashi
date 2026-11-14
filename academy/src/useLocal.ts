import { useCallback, useEffect, useState } from "react";
const EVENT = "academy-local-change";
const session = new Map<string, unknown>();
/** Versioned local records. Refused storage degrades to session memory; no account sync. */
export function useLocal<T>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null
        ? ((session.get(key) as T) ?? fallback)
        : (JSON.parse(raw) as T);
    } catch {
      return (session.get(key) as T) ?? fallback;
    }
  });
  useEffect(() => {
    const local = (event: Event) => {
      const e = event as CustomEvent<{ key: string; value: T }>;
      if (e.detail.key === key) setValue(e.detail.value);
    };
    const other = (event: StorageEvent) => {
      if (event.key === key) {
        try {
          setValue(
            event.newValue === null ? fallback : JSON.parse(event.newValue),
          );
        } catch {
          /* Retain a valid in-memory record. */
        }
      }
    };
    window.addEventListener(EVENT, local);
    window.addEventListener("storage", other);
    return () => {
      window.removeEventListener(EVENT, local);
      window.removeEventListener("storage", other);
    };
  }, [key, fallback]);
  const set = useCallback(
    (next: T) => {
      session.set(key, next);
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        window.dispatchEvent(new Event("academy-save-unavailable"));
      }
      window.dispatchEvent(
        new CustomEvent(EVENT, { detail: { key, value: next } }),
      );
    },
    [key],
  );
  return [value, set];
}
