import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the built SPA (`dist/client`) as native iOS/Android apps.
 *
 * The API is NOT bundled — the native webview loads the local web assets, and
 * `VITE_API_BASE_URL` (see src/lib/api.ts) points every `/api/*` call at the
 * deployed Worker origin. Build the web bundle for mobile with that env set,
 * e.g. `VITE_API_BASE_URL=https://mediamogul.example.com npm run build`, then
 * `npx cap sync`.
 *
 * See docs/MOBILE.md for the full setup + release flow.
 */
const config: CapacitorConfig = {
  appId: "io.wlcr.mediamogul",
  appName: "MediaMogul",
  webDir: "dist/client",
  server: {
    // Serve local assets over https://localhost so secure-context web APIs and
    // cookie-less bearer-token auth behave like production.
    androidScheme: "https",
    iosScheme: "https",
  },
  ios: {
    // Let the app draw under the status bar; the SPA handles safe-area insets.
    contentInset: "always",
  },
};

export default config;
