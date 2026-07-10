import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { createMiddleware } from "hono/factory";

/**
 * The Neon Auth server lives on a different origin than this Worker, so its
 * session cookie is NOT sent with requests to our API. Instead the browser
 * sends the Neon Auth JWT as `Authorization: Bearer <token>`, and we verify it
 * here against the auth server's public JWKS (no per-request round-trip once
 * the key set is cached).
 *
 * Neon Auth exposes its JWKS at `<NEON_AUTH_URL>/.well-known/jwks.json`
 * (EdDSA / Ed25519 keys).
 */
function jwksUrl(authUrl: string): URL {
  return new URL(`${authUrl.replace(/\/+$/, "")}/.well-known/jwks.json`);
}

// Cache the remote key set per auth URL. Module scope persists across requests
// on a warm isolate, so keys are fetched once and reused.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function getJwks(authUrl: string) {
  let jwks = jwksCache.get(authUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(jwksUrl(authUrl));
    jwksCache.set(authUrl, jwks);
  }
  return jwks;
}

export interface AuthUser {
  /** Neon Auth user id (JWT `sub`). */
  id: string;
  email?: string;
  name?: string;
  payload: JWTPayload;
}

export async function verifyToken(
  token: string,
  authUrl: string,
): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, getJwks(authUrl));
  return {
    id: String(payload.sub),
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    payload,
  };
}

// App roles come from the NeonDB `role` claim in the JWT. Hierarchy:
// admin > editor > contributor > user. editor/contributor are defined for
// later use (content curation) — only `admin` is enforced anywhere today.
export type AppRole = "admin" | "editor" | "contributor" | "user";

const ROLE_RANK: Record<AppRole, number> = {
  user: 0,
  contributor: 1,
  editor: 2,
  admin: 3,
};

export function getRole(user: AuthUser): AppRole {
  const r = user.payload.role;
  return r === "admin" || r === "editor" || r === "contributor" ? r : "user";
}

/** True if the user's role is at least `min` in the hierarchy. */
export function hasRole(user: AuthUser, min: AppRole): boolean {
  return ROLE_RANK[getRole(user)] >= ROLE_RANK[min];
}

export function isAdmin(user: AuthUser): boolean {
  return hasRole(user, "admin");
}

export type AuthVariables = { user: AuthUser };

/**
 * Hono middleware that requires a valid Neon Auth session. On success it sets
 * `c.get("user")`; otherwise it responds 401.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    return c.json({ error: "Unauthorized", reason: "missing bearer token" }, 401);
  }
  try {
    c.set("user", await verifyToken(token, c.env.NEON_AUTH_URL));
  } catch {
    return c.json({ error: "Unauthorized", reason: "invalid token" }, 401);
  }
  await next();
});

/** Requires at least the given role (runs after requireAuth). */
export const requireRole = (min: AppRole) =>
  createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(
    async (c, next) => {
      if (!hasRole(c.get("user"), min)) {
        return c.json({ error: "forbidden" }, 403);
      }
      await next();
    },
  );

/** Requires the NeonDB `admin` role. */
export const requireAdmin = requireRole("admin");
