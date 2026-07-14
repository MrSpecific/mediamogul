import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  lookupBookByIsbn,
  type MediaCandidate,
  searchBooks,
  searchScreen,
  searchScreenWikidata,
} from "../services/scrape";
import type { PrismaClient } from "../generated/prisma/client";
import type { AppEnv } from "../types";

export const lookup = new Hono<AppEnv>();

type AnnotatedCandidate = MediaCandidate & { existingId?: string };

/** Flags candidates already in the catalog (matched by external id). */
async function annotateExisting(
  prisma: PrismaClient,
  candidates: MediaCandidate[],
): Promise<AnnotatedCandidate[]> {
  const pairs = candidates.flatMap((c) =>
    c.externalIds.map((e) => ({ source: e.source, value: e.value })),
  );
  if (pairs.length === 0) return candidates;

  const rows = await prisma.externalId.findMany({
    where: { OR: pairs },
    select: { source: true, value: true, mediaItemId: true },
  });
  const byKey = new Map(rows.map((r) => [`${r.source}:${r.value}`, r.mediaItemId]));

  return candidates.map((c) => ({
    ...c,
    existingId: c.externalIds
      .map((e) => byKey.get(`${e.source}:${e.value}`))
      .find(Boolean),
  }));
}

/**
 * Scrape-assist: returns normalized candidates from a public source WITHOUT
 * saving, each annotated with `existingId` if it's already in the catalog.
 */
lookup.get(
  "/",
  zValidator(
    "query",
    z.object({
      // all = unified search across every source; open_library = books;
      // wikidata = movies/TV (CC0, commercial-safe); tmdb = movies/TV (richer,
      // but requires a commercial license).
      source: z
        .enum(["all", "open_library", "wikidata", "tmdb"])
        .default("all"),
      q: z.string().optional(),
      isbn: z.string().optional(),
      page: z.coerce.number().int().min(1).max(50).default(1),
    }),
  ),
  async (c) => {
    const { source, q, isbn, page } = c.req.valid("query");
    const BOOKS_PER_PAGE = 20;
    const SCREEN_PER_PAGE = 40;

    let candidates: MediaCandidate[];
    let hasMore = false;
    if (source === "all") {
      if (!q) return c.json({ error: "provide q" }, 400);
      // Query every free source in parallel; a failing source is skipped
      // rather than failing the whole search. Interleave so no single source
      // dominates the top of the list.
      const settled = await Promise.allSettled([
        searchBooks(q, BOOKS_PER_PAGE + 1, page, BOOKS_PER_PAGE),
        searchScreenWikidata(
          q,
          (page - 1) * SCREEN_PER_PAGE,
          SCREEN_PER_PAGE + 1,
        ),
      ]);
      const lists = settled.map((s) =>
        s.status === "fulfilled" ? s.value : [],
      );
      hasMore =
        lists[0].length > BOOKS_PER_PAGE ||
        lists[1].length > SCREEN_PER_PAGE;
      candidates = interleave([
        lists[0].slice(0, BOOKS_PER_PAGE),
        lists[1].slice(0, SCREEN_PER_PAGE),
      ]);
    } else if (source === "open_library") {
      if (isbn) {
        const found = await lookupBookByIsbn(isbn);
        candidates = found ? [found] : [];
      } else if (q) {
        const results = await searchBooks(q, 11, page, 10);
        hasMore = results.length > 10;
        candidates = results.slice(0, 10);
      } else {
        return c.json({ error: "provide q or isbn" }, 400);
      }
    } else if (source === "wikidata") {
      const results = await searchScreenWikidata(
        q ?? "",
        (page - 1) * SCREEN_PER_PAGE,
        SCREEN_PER_PAGE + 1,
      );
      hasMore = results.length > SCREEN_PER_PAGE;
      candidates = results.slice(0, SCREEN_PER_PAGE);
    } else {
      try {
        candidates = await searchScreen(q ?? "", c.env.TMDB_API_KEY);
      } catch (e) {
        return c.json({ error: (e as Error).message }, 501);
      }
    }

    return c.json({
      items: await annotateExisting(c.get("prisma"), candidates),
      hasMore,
    });
  },
);

/** Round-robin merge so each source contributes near the top of the list. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}
