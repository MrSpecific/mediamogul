import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getOrCreateUser } from "../db";
import { getRole, isAdmin, effectiveRole } from "../auth";
import { requireFeature } from "../tiers";
import { username } from "../schemas";
import type { MediaType, Prisma } from "../generated/prisma/client";
import type { AppEnv } from "../types";

export const me = new Hono<AppEnv>();

/**
 * Consumption stats for the current user. Gated behind the `advancedStats`
 * feature (Standard tier) — free users get 402 and the UI shows an upgrade
 * prompt.
 */
me.get("/stats", requireFeature("advancedStats"), async (c) => {
  const prisma = c.get("prisma");
  const userId = c.get("user").id;

  const [completed, statusGroups, ratingGroups, ratingAgg, reviews, lists] =
    await Promise.all([
      prisma.mediaEntry.findMany({
        where: { userId, status: "COMPLETED" },
        select: { mediaItemId: true, finishedAt: true, mediaItem: { select: { type: true } } },
      }),
      prisma.mediaEntry.groupBy({ by: ["status"], where: { userId }, _count: true }),
      prisma.rating.groupBy({ by: ["stars"], where: { userId }, _count: true }),
      prisma.rating.aggregate({ where: { userId }, _avg: { stars: true }, _count: true }),
      prisma.review.count({ where: { userId } }),
      prisma.mediaList.count({ where: { ownerId: userId } }),
    ]);

  const year = new Date().getUTCFullYear();
  const byType: Record<string, { completions: number; titles: number }> = {};
  const distinctByType: Record<string, Set<string>> = {};
  const distinct = new Set<string>();
  let thisYear = 0;
  for (const e of completed) {
    const t = e.mediaItem.type as MediaType;
    byType[t] ??= { completions: 0, titles: 0 };
    distinctByType[t] ??= new Set();
    byType[t].completions += 1;
    distinctByType[t].add(e.mediaItemId);
    distinct.add(e.mediaItemId);
    if (e.finishedAt && e.finishedAt.getUTCFullYear() === year) thisYear += 1;
  }
  for (const t of Object.keys(byType)) byType[t].titles = distinctByType[t].size;

  const statusCounts: Record<string, number> = {};
  for (const g of statusGroups) statusCounts[g.status] = g._count;

  const distribution: Record<string, number> = {};
  for (const g of ratingGroups) distribution[Number(g.stars).toString()] = g._count;

  return c.json({
    completions: completed.length,
    distinctTitles: distinct.size,
    thisYear,
    byType,
    statusCounts,
    ratings: {
      count: ratingAgg._count,
      average: ratingAgg._avg.stars == null ? null : Number(ratingAgg._avg.stars),
      distribution,
    },
    reviews,
    lists,
  });
});

/**
 * Live username availability check for the profile editor. Validates format
 * and uniqueness (the caller's own current username counts as available).
 */
me.get("/username-available", async (c) => {
  const parsed = username.safeParse(c.req.query("username") ?? "");
  if (!parsed.success) {
    return c.json({ available: false, reason: "invalid" });
  }
  const existing = await c.get("prisma").user.findUnique({
    where: { username: parsed.data },
    select: { id: true },
  });
  const available = !existing || existing.id === c.get("user").id;
  return c.json({ available, reason: available ? null : "taken" });
});

/** Current user's profile (created on first call), plus admin flag. */
me.get("/", async (c) => {
  const profile = await getOrCreateUser(c.get("prisma"), c.get("user"));
  return c.json({
    ...profile,
    isAdmin: isAdmin(c.get("user"), c.env, profile),
    role: effectiveRole(c.get("user"), c.env, profile),
  });
});

/**
 * Diagnostic: the verified JWT claims for the current user. Handy for wiring
 * up role-based access — shows exactly what the auth provider put in the token.
 */
me.get("/claims", (c) => {
  const user = c.get("user");
  return c.json({
    email: user.email,
    resolvedRole: getRole(user),
    isAdmin: isAdmin(user, c.env),
    payload: user.payload,
  });
});

me.patch(
  "/",
  zValidator(
    "json",
    z.object({
      username: username.optional(),
      displayName: z.string().max(80).nullable().optional(),
      bio: z.string().max(500).nullable().optional(),
      avatarUrl: z.string().url().nullable().optional(),
      profilePublic: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    await getOrCreateUser(prisma, c.get("user"));
    try {
      const updated = await prisma.user.update({
        where: { id: c.get("user").id },
        data: c.req.valid("json"),
      });
      return c.json(updated);
    } catch {
      return c.json({ error: "username_taken" }, 409);
    }
  },
);

/** Recent activity: the user's own consumption entries. */
me.get("/entries", async (c) => {
  const entries = await c.get("prisma").mediaEntry.findMany({
    where: { userId: c.get("user").id },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: { mediaItem: true },
  });
  return c.json(entries);
});

/** The user's own lists, lists they've saved, and lists they collaborate on —
 *  each flagged with whether the user has starred it. */
me.get("/lists", async (c) => {
  const prisma = c.get("prisma");
  const uid = c.get("user").id;
  // A few items per list for the card preview thumbnails.
  const previewItems: Prisma.MediaList$itemsArgs = {
    take: 6,
    orderBy: [{ position: "asc" }, { addedAt: "asc" }],
    select: {
      id: true,
      mediaItem: {
        select: { id: true, type: true, title: true, coverImageUrl: true },
      },
    },
  };

  const [owned, saved, collabs, starredRows] = await Promise.all([
    prisma.mediaList.findMany({
      where: { ownerId: uid },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { items: true, collaborators: true } },
        items: previewItems,
      },
    }),
    prisma.savedList.findMany({
      where: { userId: uid },
      include: {
        list: {
          include: {
            _count: { select: { items: true, collaborators: true } },
            items: previewItems,
            owner: true,
          },
        },
      },
    }),
    prisma.listCollaborator.findMany({
      where: { userId: uid, status: "ACCEPTED" },
      include: {
        list: {
          include: {
            _count: { select: { items: true, collaborators: true } },
            items: previewItems,
            owner: true,
          },
        },
      },
    }),
    prisma.starredList.findMany({
      where: { userId: uid },
      select: { listId: true },
    }),
  ]);
  const starred = new Set(starredRows.map((s) => s.listId));
  const mark = <T extends { id: string }>(l: T) => ({
    ...l,
    isStarred: starred.has(l.id),
  });
  return c.json({
    owned: owned.map(mark),
    saved: saved.map((s) => mark(s.list)),
    shared: collabs.map((x) => mark(x.list)),
  });
});

/** Starred lists, newest star first — used for prominent homepage display. */
me.get("/starred", async (c) => {
  const rows = await c.get("prisma").starredList.findMany({
    where: { userId: c.get("user").id },
    orderBy: { createdAt: "desc" },
    include: {
      list: {
        include: {
          _count: { select: { items: true } },
          owner: { select: { username: true, displayName: true } },
        },
      },
    },
  });
  return c.json(rows.map((r) => ({ ...r.list, isStarred: true })));
});
