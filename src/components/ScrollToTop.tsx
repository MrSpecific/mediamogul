import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets the window scroll to the top whenever the route (pathname) changes.
 * The app scrolls on the window, so without this a client-side navigation —
 * e.g. clicking a media card from another media page — keeps the previous
 * page's scroll position. Query-string-only changes (filters) don't reset.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
