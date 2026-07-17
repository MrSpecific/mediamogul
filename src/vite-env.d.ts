/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Neon Auth (Better Auth) client URL — Neon Console → Auth → Configuration. */
  readonly VITE_NEON_AUTH_URL: string;
  /** Absolute Worker API origin for native (Capacitor) builds. Empty on web. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
