import { useCallback, useState, type SetStateAction } from "react";

const ADMIN_MODE_KEY = "mediamogul:admin-mode";

function readAdminMode(): boolean {
  try {
    return window.localStorage.getItem(ADMIN_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist the admin UI preference across navigation and browser sessions. */
export function useAdminMode(): [
  boolean,
  (next: SetStateAction<boolean>) => void,
] {
  const [adminMode, setAdminModeState] = useState(readAdminMode);

  const setAdminMode = useCallback((next: SetStateAction<boolean>) => {
    setAdminModeState((current) => {
      const value = typeof next === "function" ? next(current) : next;
      try {
        window.localStorage.setItem(ADMIN_MODE_KEY, String(value));
      } catch {
        // The preference remains usable for this page if storage is blocked.
      }
      return value;
    });
  }, []);

  return [adminMode, setAdminMode];
}
