/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Neon Auth (Better Auth) client URL — Neon Console → Auth → Configuration. */
  readonly VITE_NEON_AUTH_URL: string;
  /** Absolute Worker API origin for native (Capacitor) builds. Empty on web. */
  readonly VITE_API_BASE_URL?: string;
  /** Google Analytics 4 Measurement ID (G-XXXXXXXXXX). Enables gtag in prod. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
