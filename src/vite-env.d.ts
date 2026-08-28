/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "demo" produces the limited early-release artefact. See src/lib/edition.ts. */
  readonly VITE_NOSHASHI_EDITION?: "full" | "demo";
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
