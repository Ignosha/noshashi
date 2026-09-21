import { useCallback, useEffect, useState } from "react";
import { isTauri } from "./env";

/**
 * Preference persistence. Uses tauri-plugin-store on the desktop
 * (a real file under the app data dir) and falls back to
 * localStorage in the browser so `vite dev` behaves identically.
 */

const STORE_FILE = "noshashi.settings.json";

type TauriStore = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
};

let storePromise: Promise<TauriStore | null> | null = null;

async function getStore(): Promise<TauriStore | null> {
  if (!isTauri) return null;
  if (!storePromise) {
    storePromise = (async () => {
      try {
        const { load } = await import("@tauri-apps/plugin-store");
        return (await load(STORE_FILE, { autoSave: true })) as unknown as TauriStore;
      } catch (error) {
        console.error("Store unavailable, falling back to localStorage", error);
        return null;
      }
    })();
  }
  return storePromise;
}

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const store = await getStore();
  if (store) {
    try {
      const value = await store.get<T>(key);
      if (value !== null && value !== undefined) return value;
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    const raw = window.localStorage.getItem(`noshashi:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const store = await getStore();
  if (store) {
    try {
      await store.set(key, value);
      await store.save();
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    window.localStorage.setItem(`noshashi:${key}`, JSON.stringify(value));
  } catch {
    /* storage disabled — preferences stay in-memory for this session */
  }
}

/**
 * useSetting — state that hydrates from persistent storage and
 * writes back on every change. `hydrated` lets callers avoid
 * flashing the fallback value before the real one loads.
 */
export function useSetting<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readSetting(key, fallback).then((stored) => {
      if (cancelled) return;
      setValue(stored);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      void writeSetting(key, next);
    },
    [key]
  );

  return [value, update, hydrated] as const;
}
