/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" = kör utan databas med lokal exempeldata */
  readonly VITE_DEMO_DATA?: string;
}
