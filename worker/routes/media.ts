import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { lookupBookByIsbn } from "../services/scrape";
import { uploadImage } from "../services/storage";
import {
  creditRole,
  entryStatus,
  externalSource,
  mediaType,
  visibility,
} from "../schemas";
import type { AppEnv } from "../types";

export const media = new Hono<AppEnv>();

const externalIdInput = z.object({
  source: externalSource,
  value: z.string().min(1),
  url: z.string().url().optional(),
});

const creditInput = z.object({
  role: creditRole,
  name: z.string().min(1).max(200),
  externalId: z.string().optional(),
});

const mediaInput = z.object({
  type: mediaType,
  title: z.string().min(1).max(500),
  sortTitle: z.string().max(500).optional(),
  coverImageUrl: z.string().url().optional(),
  shortDescription: z.string().max(500).optional(),
  synopsis: z.string().optional(),
  releaseDate: z.coerce.date().optional(),
  originalLanguage: z.string().max(20).optional(),
  publisher: z.string().max(300).optional(),
  pageCount: z.number().int().optional(),
  runtimeMinutes: z.number().int().optional(),
  seasons: z.number().int().optional(),
  episodes: z.number().int().optional(),
  genre: z.string().max(100).optional(),
  credits: z.array(creditInput).optional(),
  externalIds: z.array(externalIdInput).optional(),
});

type ExternalIdInput = z.infer<typeof externalIdInput>;
type CreditInput = z.infer<typeof creditInput>;

// Standard relation include for returning a full media item.
const withRelations = {
  externalIds: true,
  credits: { orderBy: { position: "asc" } },
} satisfies Prisma.MediaItemInclude;

/** Column fields shared by create/import (people + external ids are separate). */
function columnData(d: {
  publisher?: string;
  pageCount?: number;
  runtimeMinutes?: number;
  seasons?: number;
  episodes?: number;
  genre?: string;
}) {
  return {
    publisher: d.publisher,
    pageCount: d.pageCount,
    runtimeMinutes: d.runtimeMinutes,
    seasons: d.seasons,
    episodes: d.episodes,
    genre: d.genre,
  };
}

/** Insert external ids + credits for a media item (no interactive txn needed). */
async function saveRelations(
  prisma: AppEnv["Variables"]["prisma"],
  mediaItemId: string,
  externalIds?: ExternalIdInput[],
  credits?: CreditInput[],
) {
  if (externalIds?.length) {
    await prisma.externalId.createMany({
      data: externalIds.map((e) => ({ ...e, mediaItemId })),
      skipDuplicates: true,
    });
  }
  if (credits?.length) {
    await prisma.credit.createMany({
      data: credits.map((cr, i) => ({ ...cr, mediaItemId, position: i })),
    });
  }
}

// --- catalog ---------------------------------------------------------------

media.get(
  "/",
  zValidator(
    "query",
    z.object({
      type: mediaType.optional(),
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }),
  ),
  async (c) => {
    const { type, q, limit, cursor } = c.req.valid("query");
    const where: Prisma.MediaItemWhereInput = {};
    if (type) where.type = type;
    if (q) where.title = { contains: q, mode: "insensitive" };

    const rows = await c.get("prisma").mediaItem.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const nextCursor = rows.length > limit ? rows.pop()!.id : null;
    return c.json({ items: rows, nextCursor });
  },
);

media.post("/", zValidator("json", mediaInput), async (c) => {
  const prisma = c.get("prisma");
  const data = c.req.valid("json");
  const created = await prisma.mediaItem.create({
    data: {
      type: data.type,
      title: data.title,
      sortTitle: data.sortTitle,
      coverImageUrl: data.coverImageUrl,
      shortDescription: data.shortDescription,
      synopsis: data.synopsis,
      releaseDate: data.releaseDate,
      originalLanguage: data.originalLanguage,
      ...columnData(data),
      source: "USER_SUBMITTED",
      createdById: c.get("user").id,
    },
  });
  await saveRelations(prisma, created.id, data.externalIds, data.credits);
  const item = await prisma.mediaItem.findUnique({
    where: { id: created.id },
    include: withRelations,
  });
  return c.json(item, 201);
});

/** Scrape-assisted create. Provide `{isbn}` (fetched server-side) or a full
 *  `{candidate}` from /api/lookup. Dedupes on external ids. */
media.post(
  "/import",
  zValidator(
    "json",
    z.object({
      isbn: z.string().optional(),
      candidate: mediaInput.optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const { isbn, candidate } = c.req.valid("json");

    const cand = candidate ?? (isbn ? await lookupBookByIsbn(isbn) : null);
    if (!cand) return c.json({ error: "nothing_to_import" }, 400);

    // Dedupe: if any external id already maps to a catalog item, return it.
    if (cand.externalIds?.length) {
      const existing = await prisma.externalId.findFirst({
        where: {
          OR: cand.externalIds.map((e) => ({
            source: e.source,
            value: e.value,
          })),
        },
        include: { mediaItem: { include: withRelations } },
      });
      if (existing) return c.json(existing.mediaItem, 200);
    }

    const created = await prisma.mediaItem.create({
      data: {
        type: cand.type,
        title: cand.title,
        coverImageUrl: cand.coverImageUrl,
        shortDescription: cand.shortDescription,
        synopsis: cand.synopsis,
        releaseDate: cand.releaseDate ? new Date(cand.releaseDate) : undefined,
        originalLanguage: cand.originalLanguage,
        ...columnData(cand),
        source: "SCRAPED",
        createdById: c.get("user").id,
      },
    });
    await saveRelations(prisma, created.id, cand.externalIds, cand.credits);
    const item = await prisma.mediaItem.findUnique({
      where: { id: created.id },
      include: withRelations,
    });
    return c.json(item, 201);
  },
);

/** Upload a cover image (raw file body). Returns the stored asset's URL. */
media.post("/assets", async (c) => {
  const bytes = await c.req.arrayBuffer();
  const contentType = c.req.header("content-type") ?? "";
  let stored;
  try {
    stored = await uploadImage(c.env, bytes, contentType);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const asset = await c.get("prisma").mediaAsset.create({
    data: {
      provider: stored.provider,
      key: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      size: stored.size,
      uploadedById: c.get("user").id,
    },
  });
  return c.json({ id: asset.id, url: asset.url }, 201);
});

media.get("/:id", async (c) => {
  const prisma = c.get("prisma");
  const id = c.req.param("id");
  const userId = c.get("user").id;

  const [item, agg, rating, review, lastEntry] = await Promise.all([
    prisma.mediaItem.findUnique({
      where: { id },
      include: {
        ...withRelations,
        _count: { select: { entries: true, reviews: true } },
      },
    }),
    prisma.rating.aggregate({
      where: { mediaItemId: id },
      _avg: { stars: true },
      _count: true,
    }),
    prisma.rating.findUnique({
      where: { userId_mediaItemId: { userId, mediaItemId: id } },
    }),
    prisma.review.findUnique({
      where: { userId_mediaItemId: { userId, mediaItemId: id } },
    }),
    prisma.mediaEntry.findFirst({
      where: { userId, mediaItemId: id },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!item) return c.json({ error: "not_found" }, 404);

  return c.json({
    ...item,
    averageRating: agg._avg.stars == null ? null : Number(agg._avg.stars),
    ratingCount: agg._count,
    you: { rating, review, lastEntry },
  });
});

media.patch("/:id", zValidator("json", mediaInput.partial()), async (c) => {
  const data = c.req.valid("json");
  // Column updates only; external ids / credits are managed via their own flows.
  const { externalIds: _ids, credits: _credits, ...rest } = data;
  const updated = await c
    .get("prisma")
    .mediaItem.update({
      where: { id: c.req.param("id") },
      data: rest,
      include: withRelations,
    })
    .catch(() => null);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// --- consumption entries (rewatch/reread supported) ------------------------

media.get("/:id/entries", async (c) => {
  const entries = await c.get("prisma").mediaEntry.findMany({
    where: { userId: c.get("user").id, mediaItemId: c.req.param("id") },
    orderBy: { createdAt: "desc" },
  });
  return c.json(entries);
});

const entryInput = z.object({
  status: entryStatus.default("COMPLETED"),
  startedAt: z.coerce.date().optional(),
  finishedAt: z.coerce.date().optional(),
  progress: z.string().max(60).optional(),
  progressValue: z.number().int().optional(),
  progressUnit: z.string().max(20).optional(),
  note: z.string().max(2000).optional(),
});

media.post("/:id/entries", zValidator("json", entryInput), async (c) => {
  const entry = await c.get("prisma").mediaEntry.create({
    data: {
      ...c.req.valid("json"),
      userId: c.get("user").id,
      mediaItemId: c.req.param("id"),
    },
  });
  return c.json(entry, 201);
});

media.patch(
  "/:id/entries/:entryId",
  zValidator("json", entryInput.partial()),
  async (c) => {
    const prisma = c.get("prisma");
    // updateMany scoped to owner so users can only edit their own entries.
    const res = await prisma.mediaEntry.updateMany({
      where: { id: c.req.param("entryId"), userId: c.get("user").id },
      data: c.req.valid("json"),
    });
    if (res.count === 0) return c.json({ error: "not_found" }, 404);
    const entry = await prisma.mediaEntry.findUnique({
      where: { id: c.req.param("entryId") },
    });
    return c.json(entry);
  },
);

media.delete("/:id/entries/:entryId", async (c) => {
  const res = await c.get("prisma").mediaEntry.deleteMany({
    where: { id: c.req.param("entryId"), userId: c.get("user").id },
  });
  return c.json({ deleted: res.count });
});

// --- rating ----------------------------------------------------------------

media.put(
  "/:id/rating",
  zValidator(
    "json",
    z.object({ stars: z.number().min(0.5).max(5).multipleOf(0.5) }),
  ),
  async (c) => {
    const { stars } = c.req.valid("json");
    const userId = c.get("user").id;
    const mediaItemId = c.req.param("id");
    const rating = await c.get("prisma").rating.upsert({
      where: { userId_mediaItemId: { userId, mediaItemId } },
      create: { userId, mediaItemId, stars },
      update: { stars },
    });
    return c.json(rating);
  },
);

media.delete("/:id/rating", async (c) => {
  await c
    .get("prisma")
    .rating.delete({
      where: {
        userId_mediaItemId: {
          userId: c.get("user").id,
          mediaItemId: c.req.param("id"),
        },
      },
    })
    .catch(() => undefined);
  return c.json({ deleted: true });
});

// --- reviews ---------------------------------------------------------------

media.get("/:id/reviews", async (c) => {
  const reviews = await c.get("prisma").review.findMany({
    where: {
      mediaItemId: c.req.param("id"),
      OR: [{ visibility: "PUBLIC" }, { userId: c.get("user").id }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { username: true, displayName: true, avatarUrl: true } },
    },
  });
  return c.json(reviews);
});

media.put(
  "/:id/review",
  zValidator(
    "json",
    z.object({
      title: z.string().max(200).optional(),
      body: z.string().min(1).max(10000),
      visibility: visibility.default("PUBLIC"),
      containsSpoilers: z.boolean().default(false),
    }),
  ),
  async (c) => {
    const data = c.req.valid("json");
    const userId = c.get("user").id;
    const mediaItemId = c.req.param("id");
    const review = await c.get("prisma").review.upsert({
      where: { userId_mediaItemId: { userId, mediaItemId } },
      create: { userId, mediaItemId, ...data },
      update: data,
    });
    return c.json(review);
  },
);

media.delete("/:id/review", async (c) => {
  await c
    .get("prisma")
    .review.delete({
      where: {
        userId_mediaItemId: {
          userId: c.get("user").id,
          mediaItemId: c.req.param("id"),
        },
      },
    })
    .catch(() => undefined);
  return c.json({ deleted: true });
});
