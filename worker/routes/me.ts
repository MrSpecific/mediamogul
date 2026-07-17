import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getOrCreateUser } from "../db";
import { getRole, isAdmin, effectiveRole } from "../auth";
import { requireFeature } from "../tiers";
import { username } from "../schemas";
import {
  FEATURE_SELECT,
  LIKED_THRESHOLD,
  affinityFromSignals,
  featuresOf,
  scoreSimilarity,
} from "../services/recommend";
import type { EntryStatus, MediaType, Prisma } from "../generated/prisma/client";
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
/** The users the current user follows (most-recently-followed first) — a
 *  compact roster to sit alongside the following-activity feed. */
me.get("/following", async (c) => {
  const rows = await c.get("prisma").follow.findMany({
    where: { followerId: c.get("user").id },
    orderBy: { createdAt: "desc" },
    select: {
      following: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });
  return c.json(rows.map((r) => r.following));
});

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

/**
 * "Recommended for you": blends two signals the app already has —
 *   • content-based — items similar to what the user has liked (rated highly or
 *     finished), scored by shared genres/creators/series;
 *   • social — how people the user follows rated things: high ratings boost an
 *     item, low ratings are anti-recommendations that push it down (the same
 *     `stars − 3` term does both, so a 5★ adds +2 while a 1★ subtracts −2).
 * Anything the user has already logged is excluded, as is anything whose blended
 * score ends up non-positive (e.g. a content match your follows panned). Returns
 * each pick with a human reason ("Because you liked X" / "Liked by @user").
 * Weights are deliberately simple and live here so they're easy to tune later.
 *
 * `?excludeListed=1` also drops anything already on one of the user's own lists
 * (used on the home feed, not on a media page's "More like this").
 */
const CONTENT_WEIGHT = 1;
const SOCIAL_WEIGHT = 2;
// Freshly-added catalog items get a small recency-scored nudge so new media
// surfaces and the feed doesn't ossify around a user's fixed set of seeds.
// Kept below a strong content match (series/creator) but competitive with a
// weak genre-only one, so it fills gaps rather than dominating.
const FRESH_WEIGHT = 1.5;
// How recent an item must be to count as "fresh" discovery, and the decay
// window over which its recency score falls from 1 (brand new) to 0.
const FRESH_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
// How hard a thumbs-down on one item penalizes candidates similar to it.
const DOWN_INFLUENCE = 0.75;

me.get("/recommendations", async (c) => {
  const prisma = c.get("prisma");
  const userId = c.get("user").id;

  const [entries, ratings, followRows, feedback] = await Promise.all([
    prisma.mediaEntry.findMany({
      where: { userId },
      select: { mediaItemId: true, status: true },
    }),
    prisma.rating.findMany({
      where: { userId },
      select: { mediaItemId: true, stars: true },
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
    prisma.recommendationFeedback.findMany({
      where: { userId },
      select: { mediaItemId: true, signal: true },
    }),
  ]);

  // Feedback shapes the feed: every reacted-to item leaves the feed; UP items
  // become extra positive seeds, DOWN items become a negative influence.
  const upIds: string[] = [];
  const downIds: string[] = [];

  const ratingByItem = new Map(
    ratings.map((r) => [r.mediaItemId, Number(r.stars)]),
  );
  const statusByItem = new Map<string, EntryStatus>();
  for (const e of entries) {
    if (!statusByItem.has(e.mediaItemId)) statusByItem.set(e.mediaItemId, e.status);
  }
  const seen = new Set<string>([
    ...ratingByItem.keys(),
    ...statusByItem.keys(),
  ]);
  for (const f of feedback) {
    seen.add(f.mediaItemId); // never re-surface anything the user reacted to
    if (f.signal === "UP") upIds.push(f.mediaItemId);
    else if (f.signal === "DOWN") downIds.push(f.mediaItemId);
  }
  // Optionally treat anything already on one of the user's own lists as "seen"
  // too, so recommendations don't surface things they've already collected.
  if (c.req.query("excludeListed")) {
    const listed = await prisma.mediaListItem.findMany({
      where: { list: { ownerId: userId } },
      select: { mediaItemId: true },
    });
    for (const li of listed) seen.add(li.mediaItemId);
  }
  const followingIds = followRows.map((r) => r.followingId);

  // Result accumulator, keyed by media id.
  type Rec = {
    media: {
      id: string;
      type: MediaType;
      title: string;
      coverImageUrl: string | null;
      shortDescription: string | null;
    };
    content: { score: number; reason: string } | null;
    social: { score: number; reason: string } | null;
    fresh: { score: number; reason: string } | null;
  };
  const recs = new Map<string, Rec>();

  // --- Content-based: neighbours of the user's liked items (+ thumbs-up),
  //     pushed down by resemblance to thumbs-down items. ---
  const likedIds = [
    ...new Set([...ratingByItem.keys(), ...statusByItem.keys()]),
  ]
    .map((id) => ({
      id,
      aff: affinityFromSignals(
        ratingByItem.get(id) ?? null,
        statusByItem.get(id) ?? null,
      ),
    }))
    .filter((a) => a.aff >= LIKED_THRESHOLD)
    .sort((a, b) => b.aff - a.aff)
    .slice(0, 20)
    .map((a) => a.id);
  // Thumbs-up items are strong explicit positives — always include them.
  const positiveSeedIds = [...new Set([...likedIds, ...upIds])].slice(0, 25);

  if (positiveSeedIds.length > 0) {
    const seedItems = await prisma.mediaItem.findMany({
      where: { id: { in: [...new Set([...positiveSeedIds, ...downIds])] } },
      select: FEATURE_SELECT,
    });
    const featById = new Map(seedItems.map((it) => [it.id, featuresOf(it)]));
    const posSeeds = positiveSeedIds
      .map((id) => featById.get(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f));
    const negSeeds = downIds
      .map((id) => featById.get(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f));

    const genreIds = new Set<string>();
    const people = new Set<string>();
    const seriesIds = new Set<string>();
    for (const s of posSeeds) {
      s.genreIds.forEach((x) => genreIds.add(x));
      s.people.forEach((x) => people.add(x));
      s.seriesIds.forEach((x) => seriesIds.add(x));
    }

    const or: Prisma.MediaItemWhereInput[] = [];
    if (genreIds.size)
      or.push({ genres: { some: { genreId: { in: [...genreIds] } } } });
    if (people.size)
      or.push({ credits: { some: { name: { in: [...people] } } } });
    if (seriesIds.size)
      or.push({ seriesEntries: { some: { seriesId: { in: [...seriesIds] } } } });

    if (or.length > 0) {
      const candidates = await prisma.mediaItem.findMany({
        where: {
          id: { notIn: [...seen] },
          archivedAt: null,
          visibility: "PUBLIC",
          OR: or,
        },
        select: { ...FEATURE_SELECT, coverImageUrl: true, shortDescription: true },
        take: 400,
      });

      for (const ci of candidates) {
        const cf = featuresOf(ci);
        let best = 0;
        let bestTitle = "";
        for (const s of posSeeds) {
          const { score } = scoreSimilarity(s, cf);
          if (score > best) {
            best = score;
            bestTitle = s.title;
          }
        }
        if (best <= 0) continue;
        // Penalize by the strongest resemblance to a thumbs-down item.
        let negBest = 0;
        for (const s of negSeeds) {
          const { score } = scoreSimilarity(s, cf);
          if (score > negBest) negBest = score;
        }
        const score = best - DOWN_INFLUENCE * negBest;
        recs.set(ci.id, {
          media: {
            id: ci.id,
            type: ci.type,
            title: ci.title,
            coverImageUrl: ci.coverImageUrl,
            shortDescription: ci.shortDescription,
          },
          content: { score, reason: `Because you liked ${bestTitle}` },
          social: null,
          fresh: null,
        });
      }
    }
  }

  // --- Social: how people the user follows rated things. High ratings boost,
  //     low ratings are anti-recommendations (the `stars - 3` term is signed).
  if (followingIds.length > 0) {
    const followRatings = await prisma.rating.findMany({
      where: {
        userId: { in: followingIds },
        // Only opinionated ratings move the needle; 3★ (neutral) is skipped.
        OR: [{ stars: { gte: 4 } }, { stars: { lte: 2 } }],
        mediaItemId: { notIn: [...seen] },
        mediaItem: { archivedAt: null, visibility: "PUBLIC" },
      },
      select: {
        stars: true,
        user: { select: { username: true } },
        mediaItem: {
          select: {
            id: true,
            type: true,
            title: true,
            coverImageUrl: true,
            shortDescription: true,
          },
        },
      },
      take: 800,
    });

    // `fans` are only the followers who rated it highly — they name the reason;
    // `score` nets the positive and negative ratings together.
    const agg = new Map<
      string,
      { score: number; fans: string[]; media: Rec["media"] }
    >();
    for (const r of followRatings) {
      const m = r.mediaItem;
      const e = agg.get(m.id) ?? { score: 0, fans: [], media: m };
      const stars = Number(r.stars);
      e.score += stars - 3; // 5★ → +2, 4★ → +1, 2★ → −1, 1★ → −2
      if (stars >= 4) e.fans.push(r.user.username);
      agg.set(m.id, e);
    }

    for (const [id, e] of agg) {
      const others = e.fans.length - 1;
      const reason = e.fans.length
        ? `Liked by @${e.fans[0]}${others > 0 ? ` +${others} you follow` : ""}`
        : "";
      const social = { score: e.score, reason };
      const existing = recs.get(id);
      if (existing) existing.social = social;
      else recs.set(id, { media: e.media, content: null, social, fresh: null });
    }
  }

  // --- Fresh discovery: recently-added items across EVERY media type, so new
  //     catalog additions surface and the feed isn't confined to whatever type
  //     the user's existing taste already matches. Pulled per-type so a
  //     book-heavy catalog can't starve movies/TV, and scored by recency. ---
  const now = Date.now();
  const freshCutoff = new Date(now - FRESH_WINDOW_MS);
  const freshTypes: MediaType[] = [
    "MOVIE",
    "TV_SHOW",
    "BOOK",
    "AUDIOBOOK",
    "MAGAZINE",
  ];
  const freshByType = await Promise.all(
    freshTypes.map((type) =>
      prisma.mediaItem.findMany({
        where: {
          id: { notIn: [...seen] },
          archivedAt: null,
          visibility: "PUBLIC",
          type,
          createdAt: { gte: freshCutoff },
        },
        select: {
          id: true,
          type: true,
          title: true,
          coverImageUrl: true,
          shortDescription: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
    ),
  );
  for (const list of freshByType) {
    for (const fi of list) {
      // recency: 1 for brand-new, decaying linearly to 0 at the window edge.
      const recency = Math.max(0, 1 - (now - fi.createdAt.getTime()) / FRESH_WINDOW_MS);
      if (recency <= 0) continue;
      const fresh = { score: recency, reason: "Recently added" };
      const existing = recs.get(fi.id);
      if (existing) existing.fresh = fresh;
      else
        recs.set(fi.id, {
          media: {
            id: fi.id,
            type: fi.type,
            title: fi.title,
            coverImageUrl: fi.coverImageUrl,
            shortDescription: fi.shortDescription,
          },
          content: null,
          social: null,
          fresh,
        });
    }
  }

  const scored = [...recs.values()]
    .map((r) => {
      const contentContribution = (r.content?.score ?? 0) * CONTENT_WEIGHT;
      const socialContribution = (r.social?.score ?? 0) * SOCIAL_WEIGHT;
      const freshContribution = (r.fresh?.score ?? 0) * FRESH_WEIGHT;
      const score = contentContribution + socialContribution + freshContribution;
      // Lead with the social reason only when it's a positive, dominant signal;
      // a negative social score never speaks for the card.
      const socialWins =
        !!r.social &&
        r.social.score > 0 &&
        !!r.social.reason &&
        socialContribution >= contentContribution;
      let reason = "Recommended";
      if (socialWins && r.social?.reason) reason = r.social.reason;
      else if (r.content?.reason) reason = r.content.reason;
      else if (r.social && r.social.score > 0 && r.social.reason)
        reason = r.social.reason;
      else if (r.fresh?.reason) reason = r.fresh.reason;
      return { media: r.media, reason, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Diversify by media type: round-robin one pick per type each pass, strongest
  // type first. A book-heavy catalog no longer crowds movies/TV out of the top
  // 12 — any type with a qualifying candidate is represented before books fill
  // the remaining slots.
  const byType = new Map<MediaType, typeof scored>();
  for (const r of scored) {
    const list = byType.get(r.media.type);
    if (list) list.push(r);
    else byType.set(r.media.type, [r]);
  }
  const typeOrder = [...byType.entries()]
    .sort((a, b) => b[1][0].score - a[1][0].score)
    .map(([type]) => type);
  const ranked: { media: Rec["media"]; reason: string }[] = [];
  let progressed = true;
  while (ranked.length < 12 && progressed) {
    progressed = false;
    for (const type of typeOrder) {
      const next = byType.get(type)?.shift();
      if (!next) continue;
      ranked.push({ media: next.media, reason: next.reason });
      progressed = true;
      if (ranked.length >= 12) break;
    }
  }

  return c.json(ranked);
});

/**
 * Record (or clear) the user's reaction to a recommended item. UP/DOWN/HIDE all
 * remove it from future feeds; UP/DOWN additionally shape content scoring.
 * A null signal clears any existing reaction.
 */
me.put(
  "/recommendations/:mediaItemId/feedback",
  zValidator(
    "json",
    z.object({ signal: z.enum(["UP", "DOWN", "HIDE"]).nullable() }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const userId = c.get("user").id;
    const mediaItemId = c.req.param("mediaItemId");
    const { signal } = c.req.valid("json");
    if (signal === null) {
      await prisma.recommendationFeedback.deleteMany({
        where: { userId, mediaItemId },
      });
      return c.json({ signal: null });
    }
    await prisma.recommendationFeedback.upsert({
      where: { userId_mediaItemId: { userId, mediaItemId } },
      create: { userId, mediaItemId, signal },
      update: { signal },
    });
    return c.json({ signal });
  },
);

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
  // Starred lists first, then most-recently-updated. (updatedAt is bumped on
  // every item add/remove/reorder — see touchList in routes/lists.ts.)
  const byStarThenRecency = <
    T extends { isStarred: boolean; updatedAt: Date },
  >(
    a: T,
    b: T,
  ) =>
    Number(b.isStarred) - Number(a.isStarred) ||
    b.updatedAt.getTime() - a.updatedAt.getTime();
  return c.json({
    owned: owned.map(mark).sort(byStarThenRecency),
    saved: saved.map((s) => mark(s.list)).sort(byStarThenRecency),
    shared: collabs.map((x) => mark(x.list)).sort(byStarThenRecency),
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
