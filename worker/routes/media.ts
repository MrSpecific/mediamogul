import { type Context, Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { type MediaType, Prisma } from "../generated/prisma/client";
import {
  type MediaCandidate,
  importSeasons,
  lookupBookByIsbn,
  searchBooks,
  searchScreenWikidata,
  searchWikidataSeriesMembers,
} from "../services/scrape";
import { deleteImage, uploadImage } from "../services/storage";
import { type CoverSource, searchCovers } from "../services/covers";
import { linkGenres, resolveGenreId } from "../services/genres";
import { libbyTitleUrl, searchLibby } from "../services/libby";
import { requireAdmin } from "../auth";
import {
  creditRole,
  entryStatus,
  externalSource,
  mediaRelationType,
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
  subtitle: z.string().max(500).optional(),
  sortTitle: z.string().max(500).optional(),
  // Accepts absolute URLs (scraped) and relative /uploads/… paths (our R2).
  coverImageUrl: z.string().max(1000).optional(),
  shortDescription: z.string().max(500).optional(),
  synopsis: z.string().optional(),
  wikipediaUrl: z.string().url().max(1000).optional(),
  releaseDate: z.coerce.date().optional(),
  originalLanguage: z.string().max(20).optional(),
  publisher: z.string().max(300).optional(),
  pageCount: z.number().int().optional(),
  runtimeMinutes: z.number().int().optional(),
  seasons: z.number().int().optional(),
  episodes: z.number().int().optional(),
  // `genre` is a transient scrape passthrough (resolved to a Genre on save);
  // `genreIds` are chosen explicitly (manual form).
  genre: z.string().max(100).optional(),
  genreIds: z.array(z.string()).optional(),
  // Series membership — auto-creates/links a Series on save when present.
  seriesName: z.string().max(300).optional(),
  seriesPosition: z.number().int().optional(),
  credits: z.array(creditInput).optional(),
  externalIds: z.array(externalIdInput).optional(),
});

type ExternalIdInput = z.infer<typeof externalIdInput>;
type CreditInput = z.infer<typeof creditInput>;

// Standard relation include for returning a full media item.
const withRelations = {
  externalIds: true,
  credits: { orderBy: { position: "asc" } },
  genres: { include: { genre: true } },
} satisfies Prisma.MediaItemInclude;

/** Column fields shared by create/import (people, genres, ids are separate). */
function columnData(d: {
  publisher?: string;
  pageCount?: number;
  runtimeMinutes?: number;
  seasons?: number;
  episodes?: number;
}) {
  return {
    publisher: d.publisher,
    pageCount: d.pageCount,
    runtimeMinutes: d.runtimeMinutes,
    seasons: d.seasons,
    episodes: d.episodes,
  };
}

/** Resolve a scrape `genre` string + explicit `genreIds` and link them. */
async function saveGenres(
  prisma: AppEnv["Variables"]["prisma"],
  mediaItemId: string,
  type: MediaType,
  opts: { genre?: string; genreIds?: string[] },
) {
  const ids = [...(opts.genreIds ?? [])];
  if (opts.genre) ids.push(await resolveGenreId(prisma, opts.genre, type));
  await linkGenres(prisma, mediaItemId, ids);
}

/**
 * Find-or-create a Series by (case-insensitive) title and link this item at the
 * given position. Because the lookup is by title, importing several members of
 * the same series over time connects them under one Series automatically.
 */
async function saveSeries(
  prisma: AppEnv["Variables"]["prisma"],
  mediaItemId: string,
  name: string,
  position: number | undefined,
  createdById: string,
) {
  const title = name.trim();
  if (!title) return;
  const existing = await prisma.series.findFirst({
    where: { title: { equals: title, mode: "insensitive" } },
  });
  const seriesId =
    existing?.id ??
    (await prisma.series.create({ data: { title, createdById } })).id;

  // Already linked? Leave its position as-is.
  const already = await prisma.seriesEntry.findUnique({
    where: { seriesId_mediaItemId: { seriesId, mediaItemId } },
  });
  if (already) return;

  const max = await prisma.seriesEntry.aggregate({
    where: { seriesId },
    _max: { position: true },
  });
  const append = (max._max.position ?? 0) + 1;
  // Prefer the source's ordinal, but fall back to append if it collides.
  const wanted = position && position > 0 ? position : append;
  try {
    await prisma.seriesEntry.create({
      data: { seriesId, mediaItemId, position: wanted },
    });
  } catch {
    await prisma.seriesEntry
      .create({ data: { seriesId, mediaItemId, position: append } })
      .catch(() => undefined);
  }
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

/**
 * Persist a scraped candidate (create + external ids + credits + genres +
 * series), deduping on external id. Returns the item id and whether it already
 * existed. Shared by /import (isbn path) and /import-series.
 */
async function importScrapeCandidate(
  prisma: AppEnv["Variables"]["prisma"],
  cand: MediaCandidate,
  userId: string,
): Promise<{ id: string; existed: boolean }> {
  if (cand.externalIds?.length) {
    const existing = await prisma.externalId.findFirst({
      where: {
        OR: cand.externalIds.map((e) => ({ source: e.source, value: e.value })),
      },
      select: { mediaItemId: true },
    });
    if (existing) return { id: existing.mediaItemId, existed: true };
  }
  const created = await prisma.mediaItem.create({
    data: {
      type: cand.type,
      title: cand.title,
      subtitle: cand.subtitle,
      coverImageUrl: cand.coverImageUrl,
      shortDescription: cand.shortDescription,
      synopsis: cand.synopsis,
      wikipediaUrl: cand.wikipediaUrl,
      releaseDate: cand.releaseDate ? new Date(cand.releaseDate) : undefined,
      originalLanguage: cand.originalLanguage,
      ...columnData(cand),
      source: "SCRAPED",
      createdById: userId,
    },
  });
  await saveRelations(prisma, created.id, cand.externalIds, cand.credits);
  await saveGenres(prisma, created.id, cand.type, {
    genre: cand.genre,
    genreIds: cand.genreIds,
  });
  if (cand.seriesName) {
    await saveSeries(
      prisma,
      created.id,
      cand.seriesName,
      cand.seriesPosition,
      userId,
    );
  }
  return { id: created.id, existed: false };
}

/**
 * Fetch a remote image, store it in R2, record a provenance asset, and set it
 * as the item's cover. Returns the stored URL, or null if the fetch failed.
 */
async function ingestRemoteCover(
  c: Context<AppEnv>,
  mediaItemId: string,
  opts: {
    imageUrl: string;
    sourceName?: string;
    sourceUrl?: string;
    license?: string;
    creator?: string;
  },
): Promise<string | null> {
  const prisma = c.get("prisma");
  const res = await fetch(opts.imageUrl, {
    headers: { "User-Agent": "mediamogul/1.0 (media consumption tracker)" },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const contentType = res.headers.get("content-type")?.split(";")[0] ?? "";
  const bytes = await res.arrayBuffer();
  const stored = await uploadImage(c.env, bytes, contentType);
  const asset = await prisma.mediaAsset.create({
    data: {
      mediaItemId,
      kind: "COVER",
      provider: stored.provider,
      key: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      size: stored.size,
      sourceName: opts.sourceName,
      sourceUrl: opts.sourceUrl,
      license: opts.license,
      creator: opts.creator,
      uploadedById: c.get("user").id,
    },
  });
  await makeCoverPrimary(prisma, mediaItemId, asset.id, stored.url);
  return stored.url;
}

/** Mark one cover asset primary (demoting the rest) and sync the item's cover. */
async function makeCoverPrimary(
  prisma: AppEnv["Variables"]["prisma"],
  mediaItemId: string,
  assetId: string,
  url: string,
) {
  await prisma.mediaAsset.updateMany({
    where: { mediaItemId, kind: "COVER", isPrimary: true },
    data: { isPrimary: false },
  });
  await prisma.mediaAsset.update({
    where: { id: assetId },
    data: { isPrimary: true },
  });
  await prisma.mediaItem.update({
    where: { id: mediaItemId },
    data: { coverImageUrl: url },
  });
}

// --- catalog ---------------------------------------------------------------

media.get(
  "/",
  zValidator(
    "query",
    z.object({
      // Comma-separated MediaType list; omit for all types.
      types: z.string().optional(),
      q: z.string().optional(),
      genre: z.string().optional(), // genre slug
      credit: z.string().optional(), // person name (author/director/…)
      order: z.enum(["new", "title", "release"]).default("new"),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }),
  ),
  async (c) => {
    const { types, q, genre, credit, order, limit, cursor } =
      c.req.valid("query");
    // Public catalog hides archived + non-public items.
    const where: Prisma.MediaItemWhereInput = {
      archivedAt: null,
      visibility: "PUBLIC",
    };
    if (types !== undefined) {
      const valid = new Set<string>(mediaType.options);
      where.type = {
        in: types.split(",").filter((t) => valid.has(t)) as MediaType[],
      };
    }
    if (q) where.title = { contains: q, mode: "insensitive" };
    if (genre) where.genres = { some: { genre: { slug: genre } } };
    if (credit) {
      where.credits = { some: { name: { contains: credit, mode: "insensitive" } } };
    }

    const orderBy: Prisma.MediaItemOrderByWithRelationInput[] =
      order === "title"
        ? [{ title: "asc" }]
        : order === "release"
          ? [{ releaseDate: "desc" }, { id: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }];

    const rows = await c.get("prisma").mediaItem.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    const nextCursor = hasMore ? rows.at(-1)!.id : null;
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
      subtitle: data.subtitle,
      sortTitle: data.sortTitle,
      coverImageUrl: data.coverImageUrl,
      shortDescription: data.shortDescription,
      synopsis: data.synopsis,
      wikipediaUrl: data.wikipediaUrl,
      releaseDate: data.releaseDate,
      originalLanguage: data.originalLanguage,
      ...columnData(data),
      source: "USER_SUBMITTED",
      createdById: c.get("user").id,
    },
  });
  await saveRelations(prisma, created.id, data.externalIds, data.credits);
  await saveGenres(prisma, created.id, data.type, {
    genre: data.genre,
    genreIds: data.genreIds,
  });
  if (data.seriesName) {
    await saveSeries(
      prisma,
      created.id,
      data.seriesName,
      data.seriesPosition,
      c.get("user").id,
    );
  }
  // New TV shows automatically pull their season/episode guide (best-effort).
  if (created.type === "TV_SHOW") {
    await importAndPersistSeasons(prisma, c.env, {
      id: created.id,
      title: created.title,
      externalIds: data.externalIds ?? [],
    }).catch((err) => console.error("auto season import failed:", err));
  }
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
        subtitle: cand.subtitle,
        coverImageUrl: cand.coverImageUrl,
        shortDescription: cand.shortDescription,
        synopsis: cand.synopsis,
        wikipediaUrl: cand.wikipediaUrl,
        releaseDate: cand.releaseDate ? new Date(cand.releaseDate) : undefined,
        originalLanguage: cand.originalLanguage,
        ...columnData(cand),
        source: "SCRAPED",
        createdById: c.get("user").id,
      },
    });
    await saveRelations(prisma, created.id, cand.externalIds, cand.credits);
    await saveGenres(prisma, created.id, cand.type, {
      genre: cand.genre,
      genreIds: cand.genreIds,
    });
    if (cand.seriesName) {
      await saveSeries(
        prisma,
        created.id,
        cand.seriesName,
        cand.seriesPosition,
        c.get("user").id,
      );
    }
    // New TV shows automatically pull their season/episode guide (best-effort;
    // a lookup miss or source hiccup must not fail the add).
    if (created.type === "TV_SHOW") {
      await importAndPersistSeasons(prisma, c.env, {
        id: created.id,
        title: created.title,
        externalIds: cand.externalIds ?? [],
      }).catch((err) => console.error("auto season import failed:", err));
    }
    const item = await prisma.mediaItem.findUnique({
      where: { id: created.id },
      include: withRelations,
    });
    return c.json(item, 201);
  },
);

/**
 * Import every member of a series at once (e.g. all 8 Harry Potter films) and
 * link them into one Series. Currently backed by Wikidata (movies/TV).
 */
media.post(
  "/import-series",
  zValidator(
    "json",
    z.object({
      source: z.literal("wikidata"),
      seriesId: z.string().min(1), // Wikidata QID
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const { seriesId } = c.req.valid("json");
    const members = await searchWikidataSeriesMembers(seriesId);
    if (members.length === 0) return c.json({ error: "no_members" }, 404);

    let created = 0;
    let existed = 0;
    // Sequential: each import dedupes + links into the shared Series row.
    for (const m of members) {
      const r = await importScrapeCandidate(prisma, m, c.get("user").id).catch(
        () => null,
      );
      if (!r) continue;
      if (r.existed) existed += 1;
      else created += 1;
    }
    return c.json({ total: members.length, created, existed });
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

/** Creative-Commons cover-image candidates (defaults to the item's title). */
media.get("/:id/cover-options", async (c) => {
  const item = await c.get("prisma").mediaItem.findUnique({
    where: { id: c.req.param("id") },
    select: { title: true },
  });
  if (!item) return c.json({ error: "not_found" }, 404);
  const q = c.req.query("q") || item.title;
  const source: CoverSource = c.req.query("source") === "loc" ? "loc" : "commons";
  return c.json(await searchCovers(source, q));
});

/** Ingest a chosen (CC-licensed) image into R2 and set it as the cover. */
media.post(
  "/:id/cover",
  zValidator(
    "json",
    z.object({
      imageUrl: z.string().url(),
      sourceName: z.string().optional(),
      sourceUrl: z.string().url().optional(),
      license: z.string().optional(),
      creator: z.string().optional(),
    }),
  ),
  async (c) => {
    const { imageUrl, sourceName, sourceUrl, license, creator } =
      c.req.valid("json");
    const url = await ingestRemoteCover(c, c.req.param("id"), {
      imageUrl,
      sourceName,
      sourceUrl,
      license,
      creator,
    });
    if (url === null) return c.json({ error: "fetch_failed" }, 400);
    return c.json({ coverImageUrl: url });
  },
);

/** Upload a cover image directly (raw file body) and set it. The uploader
 *  asserts they have permission to use the image (recorded on the asset). */
media.post("/:id/cover/upload", async (c) => {
  const prisma = c.get("prisma");
  const bytes = await c.req.arrayBuffer();
  const contentType = c.req.header("content-type") ?? "";
  let stored;
  try {
    stored = await uploadImage(c.env, bytes, contentType);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const asset = await prisma.mediaAsset.create({
    data: {
      mediaItemId: c.req.param("id"),
      kind: "COVER",
      provider: stored.provider,
      key: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      size: stored.size,
      sourceName: "User upload",
      license: "User-provided (permission asserted by uploader)",
      uploadedById: c.get("user").id,
    },
  });
  await makeCoverPrimary(prisma, c.req.param("id"), asset.id, stored.url);
  return c.json({ coverImageUrl: stored.url });
});

/** All cover assets for an item (primary first, then by position). */
media.get("/:id/covers", async (c) => {
  const prisma = c.get("prisma");
  const id = c.req.param("id");
  const order = [
    { isPrimary: "desc" },
    { position: "asc" },
    { createdAt: "asc" },
  ] satisfies Prisma.MediaAssetOrderByWithRelationInput[];

  let covers = await prisma.mediaAsset.findMany({
    where: { mediaItemId: id, kind: "COVER" },
    orderBy: order,
  });

  // Backfill: older covers (scraped imports, pre-linking uploads) live only on
  // `coverImageUrl` with no linked asset. Represent the current cover as an
  // asset the first time the manager loads it, so it's visible + manageable.
  const item = await prisma.mediaItem.findUnique({
    where: { id },
    select: { coverImageUrl: true },
  });
  const url = item?.coverImageUrl;
  if (url && !covers.some((cv) => cv.url === url)) {
    const isR2 = url.startsWith("/uploads/");
    const created = await prisma.mediaAsset
      .create({
        data: {
          mediaItemId: id,
          kind: "COVER",
          isPrimary: true,
          provider: isR2 ? "r2" : "external",
          key: isR2 ? url.slice("/uploads/".length) : url,
          url,
        },
      })
      .catch(() => null);
    if (created) {
      await prisma.mediaAsset.updateMany({
        where: { mediaItemId: id, kind: "COVER", isPrimary: true, id: { not: created.id } },
        data: { isPrimary: false },
      });
      covers = await prisma.mediaAsset.findMany({
        where: { mediaItemId: id, kind: "COVER" },
        orderBy: order,
      });
    }
  }

  return c.json(covers);
});

/** Admin: make an existing cover asset the primary/display cover. */
media.post("/:id/covers/:assetId/primary", requireAdmin, async (c) => {
  const prisma = c.get("prisma");
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: c.req.param("assetId"), mediaItemId: c.req.param("id") },
  });
  if (!asset) return c.json({ error: "not_found" }, 404);
  await makeCoverPrimary(prisma, c.req.param("id"), asset.id, asset.url);
  return c.json({ coverImageUrl: asset.url });
});

/** Admin: edit a cover asset's edition metadata / attribution. */
media.patch(
  "/:id/covers/:assetId",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      edition: z.string().max(120).nullable().optional(),
      editionYear: z.number().int().nullable().optional(),
      publisher: z.string().max(300).nullable().optional(),
      creator: z.string().max(300).nullable().optional(),
      license: z.string().max(200).nullable().optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const res = await prisma.mediaAsset.updateMany({
      where: { id: c.req.param("assetId"), mediaItemId: c.req.param("id") },
      data: c.req.valid("json"),
    });
    if (res.count === 0) return c.json({ error: "not_found" }, 404);
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: c.req.param("assetId") },
    });
    return c.json(asset);
  },
);

/** Admin: delete a cover asset. If it was primary, promote another (or clear). */
media.delete("/:id/covers/:assetId", requireAdmin, async (c) => {
  const prisma = c.get("prisma");
  const id = c.req.param("id");
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: c.req.param("assetId"), mediaItemId: id },
  });
  if (!asset) return c.json({ error: "not_found" }, 404);
  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  // Remove the underlying file too (R2), not just the DB record.
  await deleteImage(c.env, asset.provider, asset.key).catch(() => undefined);
  if (asset.isPrimary) {
    const next = await prisma.mediaAsset.findFirst({
      where: { mediaItemId: id, kind: "COVER" },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    if (next) {
      await makeCoverPrimary(prisma, id, next.id, next.url);
    } else {
      await prisma.mediaItem.update({
        where: { id },
        data: { coverImageUrl: null },
      });
    }
  }
  return c.json({ deleted: true });
});

// --- TV seasons & episodes -------------------------------------------------

/**
 * Keep a show's own status in sync with the viewer's episode progress:
 * IN_PROGRESS once any episode is watched, COMPLETED once all are. Called after
 * any episode/season watch change. Conservative on the way down — when nothing
 * is watched it leaves the show-level status alone (so a manually-set status
 * isn't clobbered). Episode-level entries are excluded via `episodeId: null`.
 */
async function syncShowProgress(
  prisma: AppEnv["Variables"]["prisma"],
  userId: string,
  mediaItemId: string,
): Promise<void> {
  const [total, watched] = await Promise.all([
    prisma.episode.count({ where: { season: { mediaItemId } } }),
    prisma.mediaEntry.count({
      where: {
        userId,
        mediaItemId,
        episodeId: { not: null },
        status: "COMPLETED",
      },
    }),
  ]);
  if (total === 0 || watched === 0) return;

  const status = watched >= total ? "COMPLETED" : "IN_PROGRESS";
  const existing = await prisma.mediaEntry.findFirst({
    where: { userId, mediaItemId, episodeId: null },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    if (existing.status === status) return;
    await prisma.mediaEntry.update({
      where: { id: existing.id },
      data: {
        status,
        finishedAt:
          status === "COMPLETED" ? (existing.finishedAt ?? new Date()) : null,
      },
    });
  } else {
    await prisma.mediaEntry.create({
      data: {
        userId,
        mediaItemId,
        status,
        startedAt: new Date(),
        finishedAt: status === "COMPLETED" ? new Date() : undefined,
      },
    });
  }
}

/** Seasons (with episodes) for a show, plus which episodes the user finished. */
media.get("/:id/seasons", async (c) => {
  const prisma = c.get("prisma");
  const id = c.req.param("id");
  const [seasons, watched] = await Promise.all([
    prisma.season.findMany({
      where: { mediaItemId: id },
      orderBy: { number: "asc" },
      include: { episodes: { orderBy: { number: "asc" } } },
    }),
    prisma.mediaEntry.findMany({
      where: {
        userId: c.get("user").id,
        mediaItemId: id,
        status: "COMPLETED",
        episodeId: { not: null },
      },
      select: { episodeId: true },
    }),
  ]);
  return c.json({
    seasons,
    watchedEpisodeIds: watched.map((w) => w.episodeId).filter(Boolean),
  });
});

/** Admin: add a season. `episodeCount` auto-creates numbered episode rows. */
media.post(
  "/:id/seasons",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      number: z.number().int().min(0),
      title: z.string().max(300).optional(),
      synopsis: z.string().optional(),
      episodeCount: z.number().int().min(0).max(500).optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const id = c.req.param("id");
    const { number, title, synopsis, episodeCount } = c.req.valid("json");
    const season = await prisma.season
      .create({ data: { mediaItemId: id, number, title, synopsis } })
      .catch(() => null);
    if (!season) return c.json({ error: "season_exists_or_bad_item" }, 409);
    if (episodeCount && episodeCount > 0) {
      await prisma.episode.createMany({
        data: Array.from({ length: episodeCount }, (_, i) => ({
          seasonId: season.id,
          number: i + 1,
        })),
      });
    }
    const full = await prisma.season.findUnique({
      where: { id: season.id },
      include: { episodes: { orderBy: { number: "asc" } } },
    });
    return c.json(full, 201);
  },
);

/**
 * Admin: import a show's seasons + episodes in one shot. Uses open, keyless
 * sources first (TVmaze), falling back to TMDB only if a key is configured.
 * Resolves the show from a stored TMDB/IMDB id (or the title), then upserts
 * every season and episode (idempotent — safe to re-run to refresh metadata).
 */
/**
 * Resolve + fetch a show's episode guide (TVmaze first, TMDB fallback) and
 * upsert its seasons/episodes/credits. Idempotent. Shared by the manual import
 * endpoint and the automatic import that runs when a TV show is first added.
 */
async function importAndPersistSeasons(
  prisma: AppEnv["Variables"]["prisma"],
  env: Env,
  item: { id: string; title: string; externalIds: { source: string; value: string }[] },
): Promise<{ source: "tvmaze" | "tmdb" | null; seasons: number; episodes: number }> {
  const id = item.id;
  const tmdbId = item.externalIds.find((e) => e.source === "TMDB")?.value;
  const imdbId = item.externalIds.find((e) => e.source === "IMDB")?.value;

  const result = await importSeasons({ tmdbId, imdbId, title: item.title }, env);
  if (result.seasons.length === 0) {
    return { source: null, seasons: 0, episodes: 0 };
  }

  let seasonCount = 0;
  let episodeCount = 0;
  for (const s of result.seasons) {
    const airDate = s.airDate ? new Date(s.airDate) : null;
    const season = await prisma.season.upsert({
      where: { mediaItemId_number: { mediaItemId: id, number: s.number } },
      create: { mediaItemId: id, number: s.number, title: s.title, airDate },
      update: { title: s.title, airDate },
    });
    seasonCount += 1;
    for (const e of s.episodes) {
      const epAir = e.airDate ? new Date(e.airDate) : null;
      await prisma.episode.upsert({
        where: { seasonId_number: { seasonId: season.id, number: e.number } },
        create: {
          seasonId: season.id,
          number: e.number,
          title: e.title,
          synopsis: e.synopsis,
          director: e.director,
          runtimeMinutes: e.runtimeMinutes,
          airDate: epAir,
        },
        update: {
          title: e.title,
          synopsis: e.synopsis,
          director: e.director,
          runtimeMinutes: e.runtimeMinutes,
          airDate: epAir,
        },
      });
      episodeCount += 1;
    }
  }

  // Add any show-level crew (creator/director) we don't already have, so the
  // byline is populated even for shows added without credits. Dedup by role+name.
  if (result.credits.length > 0) {
    const existing = await prisma.credit.findMany({
      where: { mediaItemId: id },
      select: { role: true, name: true },
    });
    const have = new Set(existing.map((c) => `${c.role}:${c.name}`));
    const fresh = result.credits.filter(
      (c) => !have.has(`${c.role}:${c.name}`),
    );
    if (fresh.length > 0) {
      const base = existing.length;
      await prisma.credit.createMany({
        data: fresh.map((c, i) => ({
          mediaItemId: id,
          role: c.role,
          name: c.name,
          position: base + i,
        })),
      });
    }
  }

  // Persist the resolved TMDB id so future imports skip the lookup.
  if (result.tvId != null && !tmdbId) {
    await prisma.externalId
      .create({
        data: {
          mediaItemId: id,
          source: "TMDB",
          value: String(result.tvId),
          url: `https://www.themoviedb.org/tv/${result.tvId}`,
        },
      })
      .catch(() => undefined);
  }

  return { source: result.source, seasons: seasonCount, episodes: episodeCount };
}

media.post("/:id/seasons/import", requireAdmin, async (c) => {
  const prisma = c.get("prisma");
  const id = c.req.param("id");
  const item = await prisma.mediaItem.findUnique({
    where: { id },
    select: {
      title: true,
      type: true,
      externalIds: { select: { source: true, value: true } },
    },
  });
  if (!item) return c.json({ error: "not_found" }, 404);
  if (item.type !== "TV_SHOW") return c.json({ error: "not_a_show" }, 400);

  const r = await importAndPersistSeasons(prisma, c.env, {
    id,
    title: item.title,
    externalIds: item.externalIds,
  });
  if (r.seasons === 0) return c.json({ error: "not_found_on_sources" }, 404);
  return c.json(r);
});

/** Admin: delete a season (cascades to its episodes + their entries). */
media.delete("/:id/seasons/:seasonId", requireAdmin, async (c) => {
  const res = await c.get("prisma").season.deleteMany({
    where: { id: c.req.param("seasonId"), mediaItemId: c.req.param("id") },
  });
  if (res.count === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ deleted: true });
});

/** Admin: add a single episode to a season. */
media.post(
  "/:id/seasons/:seasonId/episodes",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      number: z.number().int().min(0),
      title: z.string().max(400).optional(),
      runtimeMinutes: z.number().int().optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    // Ensure the season belongs to this item before adding.
    const season = await prisma.season.findFirst({
      where: { id: c.req.param("seasonId"), mediaItemId: c.req.param("id") },
    });
    if (!season) return c.json({ error: "not_found" }, 404);
    const ep = await prisma.episode
      .create({ data: { seasonId: season.id, ...c.req.valid("json") } })
      .catch(() => null);
    if (!ep) return c.json({ error: "episode_exists" }, 409);
    return c.json(ep, 201);
  },
);

/** Mark every episode in a season watched for the current user (idempotent). */
media.post("/:id/seasons/:seasonId/watch", async (c) => {
  const prisma = c.get("prisma");
  const id = c.req.param("id");
  const userId = c.get("user").id;
  const season = await prisma.season.findFirst({
    where: { id: c.req.param("seasonId"), mediaItemId: id },
    include: { episodes: { select: { id: true } } },
  });
  if (!season) return c.json({ error: "not_found" }, 404);
  const epIds = season.episodes.map((e) => e.id);
  const done = await prisma.mediaEntry.findMany({
    where: {
      userId,
      status: "COMPLETED",
      episodeId: { in: epIds },
    },
    select: { episodeId: true },
  });
  const doneSet = new Set(done.map((d) => d.episodeId));
  const toAdd = epIds.filter((e) => !doneSet.has(e));
  if (toAdd.length) {
    const now = new Date();
    await prisma.mediaEntry.createMany({
      data: toAdd.map((episodeId) => ({
        userId,
        mediaItemId: id,
        episodeId,
        status: "COMPLETED" as const,
        finishedAt: now,
      })),
    });
  }
  await syncShowProgress(prisma, userId, id);
  return c.json({ added: toAdd.length });
});

/** Un-watch a whole season (removes the user's episode entries for it). */
media.delete("/:id/seasons/:seasonId/watch", async (c) => {
  const prisma = c.get("prisma");
  const season = await prisma.season.findFirst({
    where: { id: c.req.param("seasonId"), mediaItemId: c.req.param("id") },
    include: { episodes: { select: { id: true } } },
  });
  if (!season) return c.json({ error: "not_found" }, 404);
  const res = await prisma.mediaEntry.deleteMany({
    where: {
      userId: c.get("user").id,
      episodeId: { in: season.episodes.map((e) => e.id) },
    },
  });
  await syncShowProgress(prisma, c.get("user").id, c.req.param("id"));
  return c.json({ removed: res.count });
});

/** Toggle a single episode watched/un-watched for the current user. */
media.post("/:id/episodes/:episodeId/watch", async (c) => {
  const prisma = c.get("prisma");
  const id = c.req.param("id");
  const episodeId = c.req.param("episodeId");
  const userId = c.get("user").id;
  // Verify the episode belongs to this show.
  const ep = await prisma.episode.findFirst({
    where: { id: episodeId, season: { mediaItemId: id } },
    select: { id: true },
  });
  if (!ep) return c.json({ error: "not_found" }, 404);
  const existing = await prisma.mediaEntry.findFirst({
    where: { userId, episodeId, status: "COMPLETED" },
  });
  if (existing) {
    await prisma.mediaEntry.delete({ where: { id: existing.id } });
    await syncShowProgress(prisma, userId, id);
    return c.json({ watched: false });
  }
  await prisma.mediaEntry.create({
    data: {
      userId,
      mediaItemId: id,
      episodeId,
      status: "COMPLETED",
      finishedAt: new Date(),
    },
  });
  await syncShowProgress(prisma, userId, id);
  return c.json({ watched: true });
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
        createdBy: { select: { username: true, displayName: true } },
        seriesEntries: {
          include: {
            series: { include: { _count: { select: { entries: true } } } },
          },
        },
        relationsFrom: { include: { to: true } },
        relationsTo: { include: { from: true } },
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
      // Show-level status only — exclude per-episode entries (episodeId set),
      // which otherwise flip the whole show to "Completed" after one episode.
      where: { userId, mediaItemId: id, episodeId: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!item) return c.json({ error: "not_found" }, 404);

  const { relationsFrom, relationsTo, seriesEntries, genres, ...rest } = item;
  const genreList = genres.map((g) => g.genre);
  const related = [
    ...relationsFrom.map((r) => ({
      id: r.id,
      type: r.type,
      media: r.to,
    })),
    ...relationsTo.map((r) => ({
      id: r.id,
      type: r.type,
      media: r.from,
    })),
  ];
  const series = seriesEntries.map((se) => ({
    id: se.series.id,
    title: se.series.title,
    position: se.position,
    total: se.series._count.entries,
  }));

  return c.json({
    ...rest,
    genres: genreList,
    related,
    series,
    averageRating: agg._avg.stars == null ? null : Number(agg._avg.stars),
    ratingCount: agg._count,
    you: { rating, review, lastEntry },
  });
});

media.patch("/:id", zValidator("json", mediaInput.partial()), async (c) => {
  // Column updates only; external ids / credits are managed via their own flows.
  const { externalIds, credits, ...rest } = c.req.valid("json");
  void externalIds;
  void credits;
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
    include: {
      // Episode label for per-episode entries (null for show-level entries), so
      // "Your journey" can show "S1·E5 — Old Cases" instead of a bare status.
      episode: {
        select: {
          number: true,
          title: true,
          season: { select: { number: true } },
        },
      },
    },
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

// --- relations (link one media item to another) ---------------------------

media.post(
  "/:id/relations",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      toId: z.string().min(1),
      type: mediaRelationType,
      note: z.string().max(500).optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const fromId = c.req.param("id");
    const { toId, type, note } = c.req.valid("json");
    if (toId === fromId) return c.json({ error: "cannot_link_self" }, 400);
    const target = await prisma.mediaItem.findUnique({
      where: { id: toId },
      select: { id: true },
    });
    if (!target) return c.json({ error: "target_not_found" }, 404);

    const rel = await prisma.mediaRelation.upsert({
      where: { fromId_toId_type: { fromId, toId, type } },
      create: { fromId, toId, type, note },
      update: { note },
      include: { to: true },
    });
    return c.json(rel, 201);
  },
);

media.delete("/:id/relations/:relId", requireAdmin, async (c) => {
  const res = await c.get("prisma").mediaRelation.deleteMany({
    where: { id: c.req.param("relId"), fromId: c.req.param("id") },
  });
  return c.json({ deleted: res.count });
});

/** Admin moderation: change catalog visibility and archive/unarchive. */
media.patch(
  "/:id/moderation",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      visibility: visibility.optional(),
      archived: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const data: Prisma.MediaItemUpdateInput = {};
    if (body.visibility) data.visibility = body.visibility;
    if (body.archived !== undefined) {
      data.archivedAt = body.archived ? new Date() : null;
    }
    const updated = await c
      .get("prisma")
      .mediaItem.update({ where: { id: c.req.param("id") }, data })
      .catch(() => null);
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json({
      visibility: updated.visibility,
      archivedAt: updated.archivedAt,
    });
  },
);

/** Admin: permanently delete a media item (cascades to all its relations). */
media.delete("/:id", requireAdmin, async (c) => {
  const deleted = await c
    .get("prisma")
    .mediaItem.delete({ where: { id: c.req.param("id") } })
    .catch(() => null);
  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.json({ deleted: true });
});

// --- admin: re-scrape source data + selectively apply ----------------------

/** Which public source backs re-scraping for a given media type. */
function scrapeSourceFor(type: MediaType) {
  if (type === "BOOK" || type === "AUDIOBOOK") return searchBooks;
  if (type === "MOVIE" || type === "TV_SHOW") return searchScreenWikidata;
  return null; // MAGAZINE has no automated source
}

/**
 * Admin: re-run the source lookup for an existing item and return a fresh
 * candidate alongside the item's current values, WITHOUT applying anything.
 * The client diffs the two and posts back the fields to apply.
 */
media.post("/:id/rescrape", requireAdmin, async (c) => {
  const prisma = c.get("prisma");
  const item = await prisma.mediaItem.findUnique({
    where: { id: c.req.param("id") },
    include: withRelations,
  });
  if (!item) return c.json({ error: "not_found" }, 404);

  const searchFn = scrapeSourceFor(item.type);
  if (!searchFn) {
    return c.json({ error: "no_source_for_type", type: item.type }, 400);
  }

  const results = await searchFn(item.title).catch(() => [] as MediaCandidate[]);
  // Prefer a result that shares an external id with the item; else the top hit.
  const known = new Set(item.externalIds.map((e) => `${e.source}:${e.value}`));
  const candidate =
    results.find((r) =>
      r.externalIds.some((e) => known.has(`${e.source}:${e.value}`)),
    ) ??
    results[0] ??
    null;

  return c.json({
    candidate,
    current: {
      title: item.title,
      subtitle: item.subtitle,
      shortDescription: item.shortDescription,
      synopsis: item.synopsis,
      coverImageUrl: item.coverImageUrl,
      releaseDate: item.releaseDate,
      originalLanguage: item.originalLanguage,
      publisher: item.publisher,
      pageCount: item.pageCount,
      runtimeMinutes: item.runtimeMinutes,
      seasons: item.seasons,
      episodes: item.episodes,
      credits: item.credits.map((cr) => ({ role: cr.role, name: cr.name })),
      genres: item.genres.map((g) => g.genre.name),
    },
  });
});

/**
 * Admin: apply selected scraped values. Everything is optional — only the keys
 * present are changed. `replaceCredits` swaps the full credit list;
 * `addGenres` resolves + links genre names; `coverImageUrl` (a remote URL) is
 * ingested into R2 with provenance.
 */
media.post(
  "/:id/apply",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      patch: z
        .object({
          title: z.string().min(1).max(500).optional(),
          subtitle: z.string().max(500).nullable().optional(),
          shortDescription: z.string().max(500).nullable().optional(),
          synopsis: z.string().nullable().optional(),
          releaseDate: z.coerce.date().nullable().optional(),
          originalLanguage: z.string().max(20).nullable().optional(),
          publisher: z.string().max(300).nullable().optional(),
          pageCount: z.number().int().nullable().optional(),
          runtimeMinutes: z.number().int().nullable().optional(),
          seasons: z.number().int().nullable().optional(),
          episodes: z.number().int().nullable().optional(),
        })
        .optional(),
      replaceCredits: z.array(creditInput).optional(),
      addGenres: z.array(z.string().min(1)).optional(),
      cover: z
        .object({
          imageUrl: z.string().url(),
          sourceName: z.string().optional(),
          sourceUrl: z.string().url().optional(),
          license: z.string().optional(),
          creator: z.string().optional(),
        })
        .optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const id = c.req.param("id");
    const { patch, replaceCredits, addGenres, cover } = c.req.valid("json");

    const item = await prisma.mediaItem.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (!item) return c.json({ error: "not_found" }, 404);

    if (patch && Object.keys(patch).length > 0) {
      await prisma.mediaItem.update({ where: { id }, data: patch });
    }

    if (replaceCredits) {
      await prisma.credit.deleteMany({ where: { mediaItemId: id } });
      if (replaceCredits.length) {
        await prisma.credit.createMany({
          data: replaceCredits.map((cr, i) => ({
            ...cr,
            mediaItemId: id,
            position: i,
          })),
        });
      }
    }

    if (addGenres?.length) {
      const ids = await Promise.all(
        addGenres.map((name) => resolveGenreId(prisma, name, item.type)),
      );
      await linkGenres(prisma, id, ids);
    }

    let coverImageUrl: string | null | undefined;
    if (cover) {
      coverImageUrl = await ingestRemoteCover(c, id, cover);
      if (coverImageUrl === null) {
        return c.json({ error: "cover_fetch_failed" }, 400);
      }
    }

    const updated = await prisma.mediaItem.findUnique({
      where: { id },
      include: withRelations,
    });
    return c.json(updated);
  },
);

// --- Libby / OverDrive linking ---------------------------------------------

media.put(
  "/:id/wikipedia",
  requireAdmin,
  zValidator("json", z.object({ url: z.string().url().max(1000).nullable() })),
  async (c) => {
    const item = await c.get("prisma").mediaItem
      .update({
        where: { id: c.req.param("id") },
        data: { wikipediaUrl: c.req.valid("json").url },
        select: { wikipediaUrl: true },
      })
      .catch(() => null);
    if (!item) return c.json({ error: "not_found" }, 404);
    return c.json(item);
  },
);

/** Admin: search Libby for this item (defaults to the item's title). */
media.get("/:id/libby/search", requireAdmin, async (c) => {
  const item = await c.get("prisma").mediaItem.findUnique({
    where: { id: c.req.param("id") },
    select: { title: true },
  });
  if (!item) return c.json({ error: "not_found" }, 404);
  const q = c.req.query("q") || item.title;
  return c.json(await searchLibby(q, c.env.LIBBY_LIBRARY_KEY));
});

/** Admin: link a Libby title id to this item, optionally adopting its cover. */
media.post(
  "/:id/libby",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      libbyId: z.string().min(1),
      coverUrl: z.string().url().optional(),
      seriesName: z.string().max(300).optional(),
      seriesPosition: z.number().int().optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const id = c.req.param("id");
    const { libbyId, coverUrl, seriesName, seriesPosition } =
      c.req.valid("json");
    const url = libbyTitleUrl(libbyId);
    await prisma.externalId
      .upsert({
        where: { mediaItemId_source: { mediaItemId: id, source: "LIBBY" } },
        create: { mediaItemId: id, source: "LIBBY", value: libbyId, url },
        update: { value: libbyId, url },
      })
      .catch(() => null);
    if (coverUrl) {
      await ingestRemoteCover(c, id, {
        imageUrl: coverUrl,
        sourceName: "Libby / OverDrive",
        sourceUrl: url,
      });
    }
    // Libby carries reliable series data — link it up when present.
    if (seriesName) {
      await saveSeries(prisma, id, seriesName, seriesPosition, c.get("user").id);
    }
    return c.json({ ok: true, url });
  },
);
