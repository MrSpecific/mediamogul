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
    }),
  ),
  async (c) => {
    const { source, q, isbn } = c.req.valid("query");

    let candidates: MediaCandidate[];
    if (source === "all") {
      if (!q) return c.json({ error: "provide q" }, 400);
      // Query every free source in parallel; a failing source is skipped
      // rather than failing the whole search. Interleave so no single source
      // dominates the top of the list.
      const settled = await Promise.allSettled([
        searchBooks(q),
        searchScreenWikidata(q),
      ]);
      const lists = settled.map((s) =>
        s.status === "fulfilled" ? s.value : [],
      );
      candidates = interleave(lists);
    } else if (source === "open_library") {
      if (isbn) {
        const found = await lookupBookByIsbn(isbn);
        candidates = found ? [found] : [];
      } else if (q) {
        candidates = await searchBooks(q);
      } else {
        return c.json({ error: "provide q or isbn" }, 400);
      }
    } else if (source === "wikidata") {
      candidates = await searchScreenWikidata(q ?? "");
    } else {
      try {
        candidates = await searchScreen(q ?? "", c.env.TMDB_API_KEY);
      } catch (e) {
        return c.json({ error: (e as Error).message }, 501);
      }
    }

    return c.json(await annotateExisting(c.get("prisma"), candidates));
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
