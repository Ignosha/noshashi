/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "demo" produces the limited early-release artefact. See src/lib/edition.ts. */
  readonly VITE_NOSHASHI_EDITION?: "full" | "demo";

  /**
   * Supabase origin. Optional: src/lib/supabase/client.ts falls back to the
   * production project, which is what release builds rely on.
   *
   * Overriding this is not sufficient on its own. The Tauri CSP allowlists the
   * origin separately in both src-tauri configs, and a request to a host it
   * does not name is blocked in the packaged application. Change all three
   * together — src/lib/supabase/__tests__/client-csp.test.ts fails if they
   * disagree.
   */
  readonly VITE_SUPABASE_URL?: string;

  /**
   * Supabase publishable key. Safe to ship: it grants nothing on its own, and
   * every table is behind row level security.
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * The version from package.json, substituted at build time by vite.config.ts.
 *
 * Every user-facing version string reads this. Hard-coding it meant the About
 * panel, the footer and the legal BUILD row all still said 0.1.0 three
 * releases later, which is a bad thing for the legal row in particular to say.
 */
declare const __APP_VERSION__: string;
