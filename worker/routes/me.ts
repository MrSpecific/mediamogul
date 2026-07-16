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

/**
 * Unified activity feed for the homepage: show-level status changes, TV episode
 * watches (consecutive ones of the same show collapsed into a single "watched N
 * episodes" line), and media the user has added to the catalog — merged and
 * ordered by time.
 */
me.get("/activity", async (c) => {
  const prisma = c.get("prisma");
  const userId = c.get("user").id;

  const [entries, added] = await Promise.all([
    prisma.mediaEntry.findMany({
      where: { userId },
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
      take: 40,
      include: {
        mediaItem: { select: { id: true, type: true, title: true } },
        episode: { select: { id: true } },
      },
    }),
    prisma.mediaItem.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, type: true, title: true, createdAt: true },
    }),
  ]);

  type Media = { id: string; type: MediaType; title: string };
  type ActivityItem =
    | { kind: "entry"; key: string; media: Media; status: string; at: Date }
    | { kind: "episodes"; key: string; media: Media; count: number; at: Date }
    | { kind: "added"; key: string; media: Media; at: Date };

  // Flatten to timestamped rows, then sort newest-first.
  const rows: (
    | { t: "entry"; at: Date; id: string; media: Media; status: string }
    | { t: "episode"; at: Date; id: string; media: Media }
    | { t: "added"; at: Date; id: string; media: Media }
  )[] = [];
  for (const e of entries) {
    if (!e.mediaItem) continue;
    const at = e.finishedAt ?? e.createdAt;
    if (e.episodeId) rows.push({ t: "episode", at, id: e.id, media: e.mediaItem });
    else rows.push({ t: "entry", at, id: e.id, media: e.mediaItem, status: e.status });
  }
  for (const m of added) {
    rows.push({
      t: "added",
      at: m.createdAt,
      id: m.id,
      media: { id: m.id, type: m.type, title: m.title },
    });
  }
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());

  // Collapse consecutive episode watches of the same show.
  const items: ActivityItem[] = [];
  for (const r of rows) {
    const last = items[items.length - 1];
    if (
      r.t === "episode" &&
      last &&
      last.kind === "episodes" &&
      last.media.id === r.media.id
    ) {
      last.count += 1; // keep the latest `at` (rows are newest-first)
      continue;
    }
    if (r.t === "episode") {
      items.push({ kind: "episodes", key: r.id, media: r.media, count: 1, at: r.at });
    } else if (r.t === "entry") {
      items.push({ kind: "entry", key: r.id, media: r.media, status: r.status, at: r.at });
    } else {
      items.push({ kind: "added", key: r.id, media: r.media, at: r.at });
    }
  }

  return c.json(items.slice(0, 8));
});

/**
 * Following feed: activity from people the signed-in user follows, newest-first
 * and cursor-paginated. Everyone you follow contributes their PUBLIC reviews;
 * mutuals (people who also follow you back) additionally contribute their
 * ratings and watch/read entries. Per-episode TV watches from the same person
 * on the same show are collapsed into a single "watched N episodes" line.
 *
 * The cursor is the ISO timestamp of the last item on the previous page; every
 * source is ordered and paged by `createdAt` (the moment the action happened)
 * so a single timestamp cursor merges them cleanly.
 */
me.get("/following-activity", async (c) => {
  const prisma = c.get("prisma");
  const userId = c.get("user").id;
  const LIMIT = 20;

  const cursorParam = c.req.query("cursor");
  const before = cursorParam ? new Date(cursorParam) : null;
  if (before && Number.isNaN(before.getTime())) {
    return c.json({ error: "invalid_cursor" }, 400);
  }
  const createdBefore = before ? { createdAt: { lt: before } } : {};

  // Who the viewer follows, and which of those follow back (mutuals).
  const followRows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = followRows.map((r) => r.followingId);
  if (followingIds.length === 0) {
    return c.json({ items: [], nextCursor: null });
  }
  const backRows = await prisma.follow.findMany({
    where: { followingId: userId, followerId: { in: followingIds } },
    select: { followerId: true },
  });
  const mutualIds = backRows.map((r) => r.followerId);

  const actorSelect = {
    username: true,
    displayName: true,
    avatarUrl: true,
  } as const;
  const mediaSelect = { id: true, type: true, title: true } as const;

  const [reviews, ratings, entries] = await Promise.all([
    // Public reviews from everyone the viewer follows.
    prisma.review.findMany({
      where: { userId: { in: followingIds }, visibility: "PUBLIC", ...createdBefore },
      orderBy: { createdAt: "desc" },
      take: LIMIT + 1,
      select: {
        id: true,
        title: true,
        body: true,
        containsSpoilers: true,
        createdAt: true,
        user: { select: actorSelect },
        mediaItem: { select: mediaSelect },
      },
    }),
    // Ratings and watch/read entries only from mutuals.
    mutualIds.length
      ? prisma.rating.findMany({
          where: { userId: { in: mutualIds }, ...createdBefore },
          orderBy: { createdAt: "desc" },
          take: LIMIT + 1,
          select: {
            id: true,
            stars: true,
            createdAt: true,
            user: { select: actorSelect },
            mediaItem: { select: mediaSelect },
          },
        })
      : Promise.resolve([]),
    mutualIds.length
      ? prisma.mediaEntry.findMany({
          where: { userId: { in: mutualIds }, ...createdBefore },
          orderBy: { createdAt: "desc" },
          take: LIMIT + 1,
          select: {
            id: true,
            status: true,
            episodeId: true,
            createdAt: true,
            user: { select: actorSelect },
            mediaItem: { select: mediaSelect },
          },
        })
      : Promise.resolve([]),
  ]);

  type Actor = { username: string; displayName: string | null; avatarUrl: string | null };
  type Media = { id: string; type: MediaType; title: string };
  type FeedItem =
    | { kind: "review"; key: string; actor: Actor; media: Media; title: string | null; body: string; containsSpoilers: boolean; at: Date }
    | { kind: "rating"; key: string; actor: Actor; media: Media; stars: number; at: Date }
    | { kind: "entry"; key: string; actor: Actor; media: Media; status: string; at: Date }
    | { kind: "episodes"; key: string; actor: Actor; media: Media; count: number; at: Date };

  // Flatten every source to timestamped rows, newest-first.
  const rows: (
    | { t: "review"; at: Date; r: (typeof reviews)[number] }
    | { t: "rating"; at: Date; r: (typeof ratings)[number] }
    | { t: "episode"; at: Date; r: (typeof entries)[number] }
    | { t: "entry"; at: Date; r: (typeof entries)[number] }
  )[] = [];
  for (const r of reviews) {
    if (r.mediaItem) rows.push({ t: "review", at: r.createdAt, r });
  }
  for (const r of ratings) {
    if (r.mediaItem) rows.push({ t: "rating", at: r.createdAt, r });
  }
  for (const e of entries) {
    if (!e.mediaItem) continue;
    rows.push({ t: e.episodeId ? "episode" : "entry", at: e.createdAt, r: e });
  }
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());

  // Collapse consecutive episode watches by the same person on the same show.
  // `cursorAts[i]` tracks the OLDEST timestamp folded into items[i], so the
  // next page resumes strictly before an episode group rather than repeating it.
  const items: FeedItem[] = [];
  const cursorAts: Date[] = [];
  for (const row of rows) {
    const last = items[items.length - 1];
    if (
      row.t === "episode" &&
      last &&
      last.kind === "episodes" &&
      last.media.id === row.r.mediaItem!.id &&
      last.actor.username === row.r.user.username
    ) {
      last.count += 1;
      cursorAts[items.length - 1] = row.at; // rows are newest-first → this is older
      continue;
    }
    if (row.t === "review") {
      const r = row.r;
      items.push({
        kind: "review",
        key: r.id,
        actor: r.user,
        media: r.mediaItem!,
        title: r.title,
        body: r.body,
        containsSpoilers: r.containsSpoilers,
        at: row.at,
      });
    } else if (row.t === "rating") {
      const r = row.r;
      items.push({
        kind: "rating",
        key: r.id,
        actor: r.user,
        media: r.mediaItem!,
        stars: Number(r.stars),
        at: row.at,
      });
    } else if (row.t === "episode") {
      const e = row.r;
      items.push({ kind: "episodes", key: e.id, actor: e.user, media: e.mediaItem!, count: 1, at: row.at });
    } else {
      const e = row.r;
      items.push({ kind: "entry", key: e.id, actor: e.user, media: e.mediaItem!, status: e.status, at: row.at });
    }
    cursorAts.push(row.at);
  }

  const hasMore = items.length > LIMIT;
  const page = items.slice(0, LIMIT);
  const nextCursor = hasMore ? cursorAts[LIMIT - 1].toISOString() : null;
  return c.json({ items: page, nextCursor });
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

/**
 * Which of the caller's editable lists (owned or accepted-collaborator) already
 * contain a given media item. Powers the Add-to-list dialog's Add/Remove state.
 */
me.get("/lists/containing/:mediaId", async (c) => {
  const uid = c.get("user").id;
  const rows = await c.get("prisma").mediaListItem.findMany({
    where: {
      mediaItemId: c.req.param("mediaId"),
      list: {
        OR: [
          { ownerId: uid },
          { collaborators: { some: { userId: uid, status: "ACCEPTED" } } },
        ],
      },
    },
    select: {
      list: { select: { id: true, title: true, visibility: true } },
    },
    orderBy: { list: { title: "asc" } },
  });
  // Dedupe (a media item appears at most once per list, but be safe).
  const seen = new Set<string>();
  const lists = [];
  for (const r of rows) {
    if (seen.has(r.list.id)) continue;
    seen.add(r.list.id);
    lists.push(r.list);
  }
  return c.json({ lists });
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
