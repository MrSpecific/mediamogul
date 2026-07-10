import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { lookupBookByIsbn, searchBooks, searchScreen } from "../services/scrape";
import type { AppEnv } from "../types";

export const lookup = new Hono<AppEnv>();

/**
 * Scrape-assist: returns normalized MediaCandidate[] from a public source
 * WITHOUT saving. The client previews/edits, then POSTs to /api/media/import.
 */
lookup.get(
  "/",
  zValidator(
    "query",
    z.object({
      source: z.enum(["open_library", "tmdb"]).default("open_library"),
      q: z.string().optional(),
      isbn: z.string().optional(),
    }),
  ),
  async (c) => {
    const { source, q, isbn } = c.req.valid("query");

    if (source === "open_library") {
      if (isbn) {
        const found = await lookupBookByIsbn(isbn);
        return c.json(found ? [found] : []);
      }
      if (q) return c.json(await searchBooks(q));
      return c.json({ error: "provide q or isbn" }, 400);
    }

    // tmdb
    try {
      return c.json(await searchScreen(q ?? "", c.env.TMDB_API_KEY));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 501);
    }
  },
);
