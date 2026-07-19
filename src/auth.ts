import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react";

/**
 * Auth requests go to OUR origin (`/api/auth/*`), where the Worker proxies
 * them to the Neon Auth server (worker/routes/auth-proxy.ts). Talking to the
 * Neon origin directly made the session a third-party cookie, which
 * Safari/Firefox/incognito block — sessions vanished on reload and OAuth had
 * to run twice. Native (Capacitor) builds set VITE_API_BASE_URL to the
 * deployed origin, same as lib/api.ts.
 */
const url = `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/auth`;

/**
 * Neon Auth client (built on Better Auth). Exposes `useSession()`,
 * `signIn`, `signOut`, `getSession`, etc. The prebuilt UI components
 * (`NeonAuthUIProvider`, `AuthView`, `UserButton`) are driven by this client.
 */
export const authClient = createAuthClient(
  url.startsWith("http") ? url : new URL(url, window.location.origin).href,
  { adapter: BetterAuthReactAdapter() },
);

// The Neon Auth server lives on a different origin, so `getSession()` is a
// cross-origin request. Caching the still-valid JWT avoids making one on every
// single API call (which is slow and, on Safari/iOS, an extra chance for ITP to
// interfere with the cross-site session).
let tokenCache: { token: string; expMs: number } | null = null;

/** Decode a JWT's `exp` (ms epoch); 0 if it can't be read. */
function tokenExpiryMs(token: string): number {
  const parts = token.split(".");
  if (parts.length < 2) return 0;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Returns the JWT to authenticate calls to our own Worker API.
 * Neon Auth injects the signed JWT into `session.token` (from the
 * `set-auth-jwt` response header) whenever the session is fetched.
 * Send it as `Authorization: Bearer <token>`.
 *
 * Pass `forceRefresh` to bypass the cache (used to recover from a 401 caused by
 * an expired cached token).
 */
export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  // Reuse a cached token until ~30s before it expires.
  if (!forceRefresh && tokenCache && now < tokenCache.expMs - 30_000) {
    return tokenCache.token;
  }
  const { data } = await authClient.getSession();
  const token = data?.session?.token ?? null;
  tokenCache = token
    ? { token, expMs: tokenExpiryMs(token) || now + 60_000 }
    : null;
  return token;
}

/** Drop any cached token (on 401, or when the session ends). */
export function clearAuthTokenCache(): void {
  tokenCache = null;
}
