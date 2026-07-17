import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initAnalytics, trackPageView } from "../lib/analytics";

/**
 * Loads GA4 and reports a page view on every route change. Render inside the
 * Router. No-op unless VITE_GA_MEASUREMENT_ID is set in a production build.
 */
export function Analytics() {
  const location = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
}
