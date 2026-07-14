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

// App roles come from the JWT `role` claim (set via Neon Auth's admin plugin).
// Hierarchy: admin > editor > contributor > user. editor/contributor are
// defined for later use (content curation) — only `admin` is enforced today.
export type AppRole = "admin" | "editor" | "contributor" | "user";

const ROLE_RANK: Record<AppRole, number> = {
  user: 0,
  contributor: 1,
  editor: 2,
  admin: 3,
};

const APP_ROLES = new Set<string>(["admin", "editor", "contributor", "user"]);

/**
 * Collect app-role strings from the JWT. Neon Auth signs a GoTrue/Supabase-
 * compatible token: the top-level `role` claim is hardcoded to "authenticated"
 * (the Postgres RLS role), and the Better Auth user's real `role` field is
 * moved into `user_metadata`. So the app role lives at `user_metadata.role`.
 * We also check a few other common spots, and accept string / CSV / array.
 */
function roleClaims(user: AuthUser): string[] {
  const p = user.payload as Record<string, unknown>;
  const meta = (key: string) =>
    (p[key] as Record<string, unknown> | undefined)?.role;
  const candidates: unknown[] = [
    meta("user_metadata"), // Neon Auth puts the Better Auth role here
    meta("app_metadata"),
    meta("user"),
    p.role, // usually "authenticated" (RLS role) — ignored unless it's an app role
  ];
  const out: string[] = [];
  for (const c of candidates) {
    if (typeof c === "string") out.push(...c.split(","));
    else if (Array.isArray(c)) out.push(...c.map(String));
  }
  return out.map((r) => r.trim().toLowerCase()).filter((r) => APP_ROLES.has(r));
}

export function getRole(user: AuthUser): AppRole {
  let best: AppRole = "user";
  for (const r of roleClaims(user)) {
    if (ROLE_RANK[r as AppRole] > ROLE_RANK[best]) best = r as AppRole;
  }
  return best;
}

/** Emails granted admin regardless of JWT role (comma-separated env var). */
function adminEmails(env: Env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True if the user's email is in the ADMIN_EMAILS allowlist. */
export function isAdminByEmail(user: AuthUser, env: Env): boolean {
  const email = user.email?.toLowerCase();
  return Boolean(email && adminEmails(env).has(email));
}

/** Normalize the DB AppRole enum (uppercase) to the lowercase app-role union. */
function dbRoleToAppRole(role: string | null | undefined): AppRole | null {
  if (!role) return null;
  const r = role.toLowerCase();
  return APP_ROLES.has(r) ? (r as AppRole) : null;
}

/** The subset of the profile row that influences role resolution. */
export type RoleProfile = { appRole?: string | null } | null | undefined;

/**
 * The user's effective app role. Precedence, highest first:
 *   1. ADMIN_EMAILS allowlist → always admin. This is a lockout-safe floor: it
 *      ignores the DB override and deactivation, so the owner can't be demoted
 *      or locked out by an admin action gone wrong.
 *   2. DB override (`User.appRole`) if set → authoritative (an admin set it).
 *   3. The JWT `role` claim (the default).
 */
export function effectiveRole(
  user: AuthUser,
  env: Env,
  profile?: RoleProfile,
): AppRole {
  if (isAdminByEmail(user, env)) return "admin";
  return dbRoleToAppRole(profile?.appRole) ?? getRole(user);
}

/** True if the user's effective role is at least `min` in the hierarchy. */
export function hasRole(user: AuthUser, min: AppRole, env?: Env, profile?: RoleProfile): boolean {
  const role = env ? effectiveRole(user, env, profile) : getRole(user);
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Admin if the JWT role says so, the DB override grants it, OR the user's email
 * is in the ADMIN_EMAILS allowlist. The allowlist is a reliable fallback that
 * doesn't depend on the auth provider propagating a custom role claim.
 */
export function isAdmin(user: AuthUser, env: Env, profile?: RoleProfile): boolean {
  return effectiveRole(user, env, profile) === "admin";
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

/**
 * Requires at least the given role. Runs after requireAuth AND after the
 * profile middleware, so it can honor the DB role override (`User.appRole`) in
 * addition to the JWT role and the email allowlist.
 */
export const requireRole = (min: AppRole) =>
  createMiddleware<{
    Bindings: Env;
    Variables: AuthVariables & { profile?: { appRole?: string | null } };
  }>(async (c, next) => {
    const user = c.get("user");
    const profile = c.get("profile");
    if (!hasRole(user, min, c.env, profile)) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  });

/** Requires the NeonDB `admin` role. */
export const requireAdmin = requireRole("admin");
