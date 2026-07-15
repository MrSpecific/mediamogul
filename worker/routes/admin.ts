import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { getCronConfig, runScheduledDiscovery } from "../services/discovery";
import type { PrismaClient, Prisma } from "../generated/prisma/client";
import type { AppEnv } from "../types";

export const admin = new Hono<AppEnv>();

// All admin endpoints require the admin role (JWT role, DB override, or the
// ADMIN_EMAILS allowlist — see effectiveRole in auth.ts).
admin.use("*", requireAdmin);

// --- Control Center: scheduled-task (cron) config --------------------------

/** Current cron config + catalog counts that inform scheduling decisions. */
admin.get("/cron-config", async (c) => {
  const prisma = c.get("prisma");
  const [config, tvShows, dueShows] = await Promise.all([
    getCronConfig(prisma),
    prisma.mediaItem.count({ where: { type: "TV_SHOW" } }),
    prisma.mediaItem.count({
      where: { type: "TV_SHOW", refreshEnabled: true },
    }),
  ]);
  return c.json({ config, stats: { tvShows, refreshableShows: dueShows } });
});

admin.put(
  "/cron-config",
  zValidator(
    "json",
    z.object({
      seasonRefreshEnabled: z.boolean().optional(),
      newReleaseDiscovery: z.boolean().optional(),
      useTvmaze: z.boolean().optional(),
      useWikidata: z.boolean().optional(),
      useOpenLibrary: z.boolean().optional(),
      useTmdb: z.boolean().optional(),
      refreshBatchSize: z.number().int().min(1).max(100).optional(),
      minRefreshHours: z.number().int().min(1).max(720).optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    await getCronConfig(prisma); // ensure the row exists
    const config = await prisma.cronConfig.update({
      where: { id: "singleton" },
      data: c.req.valid("json"),
    });
    return c.json({ config });
  },
);

/** Run the scheduled discovery now (manual trigger for testing). */
admin.post("/cron-config/run", async (c) => {
  const result = await runScheduledDiscovery(c.env);
  return c.json(result);
});

const PAGE_SIZE = 30;

/** Data we can pull from Neon Auth's mirror table for a set of user ids. */
interface AuthData {
  email: string | null;
  name: string | null;
  signupAt: string | null;
}

/**
 * Join Neon Auth's `neon_auth.users_sync` for email + signup date. This table
 * is owned by the auth provider, so we query it defensively with raw SQL and
 * degrade gracefully (empty map) if its shape ever changes.
 */
async function fetchAuthData(
  prisma: PrismaClient,
  ids: string[],
): Promise<Map<string, AuthData>> {
  const map = new Map<string, AuthData>();
  if (ids.length === 0) return map;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  try {
    const rows = await prisma.$queryRawUnsafe<
      { id: string; email: string | null; name: string | null; created_at: Date | null }[]
    >(
      `SELECT id, email, name, created_at FROM neon_auth.users_sync WHERE id IN (${placeholders})`,
      ...ids,
    );
    for (const r of rows) {
      map.set(r.id, {
        email: r.email,
        name: r.name,
        signupAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      });
    }
  } catch (err) {
    console.error("users_sync lookup failed:", err);
  }
  return map;
}

/** User ids whose auth email matches a search term (for email search). */
async function idsByEmail(prisma: PrismaClient, q: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM neon_auth.users_sync WHERE email ILIKE $1 LIMIT 100`,
      `%${q}%`,
    );
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  tier: z.enum(["FREE", "STANDARD"]).optional(),
  role: z.enum(["USER", "CONTRIBUTOR", "EDITOR", "ADMIN"]).optional(),
  status: z.enum(["active", "deactivated"]).optional(),
  order: z.enum(["new", "old", "username"]).optional(),
  cursor: z.string().optional(),
});

/**
 * Paged user list for the admin console. Supports search (username, display
 * name, and auth email), and filters by tier, role override, and active state.
 *
 * NOTE on `role`: we can only see a user's DB role override (`appRole`) in bulk
 * — their JWT-derived role isn't visible server-side without their token. So the
 * role shown/filtered here is the admin-managed override (null shows as "user").
 */
admin.get("/users", zValidator("query", listQuery), async (c) => {
  const prisma = c.get("prisma");
  const { q, tier, role, status, order, cursor } = c.req.valid("query");

  const where: Prisma.UserWhereInput = {};
  if (tier) where.tier = tier;
  if (role) where.appRole = role;
  if (status === "active") where.deactivatedAt = null;
  if (status === "deactivated") where.deactivatedAt = { not: null };
  if (q) {
    const emailIds = await idsByEmail(prisma, q);
    where.OR = [
      { username: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      ...(emailIds.length ? [{ id: { in: emailIds } }] : []),
    ];
  }

  const orderBy: Prisma.UserOrderByWithRelationInput[] =
    order === "username"
      ? [{ username: "asc" }]
      : order === "old"
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }];

  const rows = await prisma.user.findMany({
    where,
    orderBy,
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      tier: true,
      appRole: true,
      profilePublic: true,
      deactivatedAt: true,
      createdAt: true,
      _count: { select: { entries: true, reviews: true, lists: true } },
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const authData = await fetchAuthData(prisma, page.map((u) => u.id));

  return c.json({
    items: page.map((u) => ({ ...u, auth: authData.get(u.id) ?? null })),
    nextCursor: hasMore ? page.at(-1)!.id : null,
  });
});

/** Full detail for one user, including auth data and recent admin audit log. */
admin.get("/users/:id", async (c) => {
  const prisma = c.get("prisma");
  const id = c.req.param("id");
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          entries: true,
          reviews: true,
          ratings: true,
          lists: true,
          followers: true,
          following: true,
        },
      },
    },
  });
  if (!user) return c.json({ error: "not_found" }, 404);

  const [authData, auditLog] = await Promise.all([
    fetchAuthData(prisma, [id]),
    prisma.adminAuditLog.findMany({
      where: { targetUserId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { actor: { select: { username: true, displayName: true } } },
    }),
  ]);

  return c.json({ ...user, auth: authData.get(id) ?? null, auditLog });
});

const patchBody = z
  .object({
    tier: z.enum(["FREE", "STANDARD"]).optional(),
    // null clears the override (defer to JWT/allowlist).
    appRole: z.enum(["USER", "CONTRIBUTOR", "EDITOR", "ADMIN"]).nullable().optional(),
    deactivated: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "no changes provided");

/** Update a user's tier / role override / active state, with an audit trail. */
admin.patch("/users/:id", zValidator("json", patchBody), async (c) => {
  const prisma = c.get("prisma");
  const id = c.req.param("id");
  const actorId = c.get("user").id;
  const body = c.req.valid("json");

  // Guardrails: an admin can't lock themselves out or drop their own admin.
  if (id === actorId) {
    if (body.deactivated === true) {
      return c.json({ error: "cannot_deactivate_self" }, 400);
    }
    if (body.appRole !== undefined && body.appRole !== "ADMIN") {
      return c.json({ error: "cannot_demote_self" }, 400);
    }
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return c.json({ error: "not_found" }, 404);

  const data: Prisma.UserUpdateInput = {};
  const audits: { action: string; detail: Prisma.InputJsonValue }[] = [];

  if (body.tier !== undefined && body.tier !== target.tier) {
    data.tier = body.tier;
    audits.push({ action: "tier.change", detail: { from: target.tier, to: body.tier } });
  }
  if (body.appRole !== undefined && body.appRole !== target.appRole) {
    data.appRole = body.appRole;
    audits.push({
      action: "role.change",
      detail: { from: target.appRole ?? null, to: body.appRole },
    });
  }
  if (body.deactivated !== undefined) {
    const isDeactivated = target.deactivatedAt !== null;
    if (body.deactivated !== isDeactivated) {
      data.deactivatedAt = body.deactivated ? new Date() : null;
      audits.push({ action: body.deactivated ? "deactivate" : "reactivate", detail: {} });
    }
  }

  if (audits.length === 0) {
    return c.json({ error: "no_effective_change" }, 400);
  }

  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id }, data }),
    prisma.adminAuditLog.createMany({
      data: audits.map((a) => ({
        actorId,
        targetUserId: id,
        action: a.action,
        detail: a.detail,
      })),
    }),
  ]);

  return c.json(updated);
});
