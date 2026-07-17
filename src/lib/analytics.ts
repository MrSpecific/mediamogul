/**
 * Google Analytics 4 (gtag.js), loaded lazily and only when configured.
 *
 * The Measurement ID comes from `VITE_GA_MEASUREMENT_ID` (a G-XXXXXXXXXX id),
 * and tracking runs only in production builds so local dev never pollutes the
 * GA property. Page views are sent manually (see components/Analytics.tsx) so
 * client-side route changes are captured, not just the first load.
 */
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

/** True when an ID is configured and this is a production build. */
export function analyticsEnabled(): boolean {
  return Boolean(GA_ID) && import.meta.env.PROD;
}

/** Inject gtag.js once and configure the property. Idempotent + safe to call
 *  when disabled (no-op). */
export function initAnalytics(): void {
  if (initialized || !analyticsEnabled()) return;
  initialized = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  // Google's canonical shim pushes the raw `arguments` object onto dataLayer.
  function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  }
  window.gtag = gtag;

  window.gtag("js", new Date());
  // Manual page views (send on every SPA navigation instead of only on load).
  window.gtag("config", GA_ID, { send_page_view: false });
}

/** Report a single page view for the current SPA location. */
export function trackPageView(path: string): void {
  if (!analyticsEnabled() || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
