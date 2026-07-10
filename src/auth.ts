import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react";

const url = import.meta.env.VITE_NEON_AUTH_URL;
if (!url) {
  throw new Error(
    "VITE_NEON_AUTH_URL is not set. Copy it from Neon Console → Auth → Configuration into your .env file.",
  );
}

/**
 * Neon Auth client (built on Better Auth). Exposes `useSession()`,
 * `signIn`, `signOut`, `getSession`, etc. The prebuilt UI components
 * (`NeonAuthUIProvider`, `AuthView`, `UserButton`) are driven by this client.
 */
export const authClient = createAuthClient(url, {
  adapter: BetterAuthReactAdapter(),
});

/**
 * Returns the JWT to authenticate calls to our own Worker API.
 * Neon Auth injects the signed JWT into `session.token` (from the
 * `set-auth-jwt` response header) whenever the session is fetched.
 * Send it as `Authorization: Bearer <token>`.
 */
export async function getAuthToken(): Promise<string | null> {
  const { data } = await authClient.getSession();
  return data?.session?.token ?? null;
}
