/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Neon Auth (Better Auth) client URL — Neon Console → Auth → Configuration. */
  readonly VITE_NEON_AUTH_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
