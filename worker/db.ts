import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { createMiddleware } from "hono/factory";
import { PrismaClient } from "./generated/prisma/client";
import type { AuthUser } from "./auth";
import type { AppEnv } from "./types";

// Route plain queries over Neon's HTTP (fetch) API; only real transactions
// (Prisma wraps every write in one) use the WebSocket pool. Keeps read paths
// off WebSockets, which are the fragile part on Workers.
neonConfig.poolQueryViaFetch = true;

/**
 * A fresh Prisma client per request. On Workers there is no long-lived process
 * to own a connection pool, so we build the Neon adapter each time and let the
 * runtime tear it down when the request ends.
 */
export function getPrisma(env: Env): PrismaClient {
  const adapter = new PrismaNeon(
    { connectionString: env.DATABASE_URL },
    // Without a handler, an async pool error becomes an unhandled rejection that
    // crashes the isolate ("internal error; reference = …"). Log instead.
    { onPoolError: (err) => console.error("Neon pool error:", err) },
  );
  return new PrismaClient({ adapter });
}

/** Attaches a per-request Prisma client at `c.get("prisma")`. */
export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  c.set("prisma", getPrisma(c.env));
  await next();
});

/**
 * Ensures an app-side profile row exists for the authenticated user. The
 * profile `id` is the Neon Auth user id; the username is seeded from the email
 * (or id) and can be changed later.
 */
export async function getOrCreateUser(prisma: PrismaClient, auth: AuthUser) {
  const existing = await prisma.user.findUnique({ where: { id: auth.id } });
  if (existing) return existing;

  const seed =
    (auth.email?.split("@")[0] ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20) || `user_${auth.id.slice(0, 8)}`;

  // Retry with a short random suffix on username collisions.
  let username = seed;
  for (let attempt = 0; attempt < 6; attempt++) {
    const clash = await prisma.user.findUnique({ where: { username } });
    if (!clash) break;
    username = `${seed}_${crypto.randomUUID().slice(0, 4)}`;
  }

  return prisma.user.create({
    data: { id: auth.id, username, displayName: auth.name ?? null },
  });
}
