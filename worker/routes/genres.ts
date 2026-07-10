import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { requireAdmin } from "../auth";
import { slugify } from "../services/genres";
import { mediaType } from "../schemas";
import type { AppEnv } from "../types";

export const genres = new Hono<AppEnv>();

/** List genres, optionally limited to those applicable to a media type
 *  (an empty applicableTypes means "all types"). Includes usage counts. */
genres.get(
  "/",
  zValidator("query", z.object({ type: mediaType.optional() })),
  async (c) => {
    const { type } = c.req.valid("query");
    const where: Prisma.GenreWhereInput = type
      ? {
          OR: [
            { applicableTypes: { has: type } },
            { applicableTypes: { isEmpty: true } },
          ],
        }
      : {};
    const rows = await c.get("prisma").genre.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { media: true } } },
    });
    return c.json(rows);
  },
);

// --- admin only ------------------------------------------------------------

genres.post(
  "/",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100),
      applicableTypes: z.array(mediaType).default([]),
    }),
  ),
  async (c) => {
    const { name, applicableTypes } = c.req.valid("json");
    try {
      const g = await c.get("prisma").genre.create({
        data: { name, slug: slugify(name), applicableTypes },
      });
      return c.json(g, 201);
    } catch {
      return c.json({ error: "genre_exists" }, 409);
    }
  },
);

genres.patch(
  "/:id",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100).optional(),
      applicableTypes: z.array(mediaType).optional(),
    }),
  ),
  async (c) => {
    const data = c.req.valid("json");
    const g = await c
      .get("prisma")
      .genre.update({
        where: { id: c.req.param("id") },
        data: { ...data, ...(data.name ? { slug: slugify(data.name) } : {}) },
      })
      .catch(() => null);
    if (!g) return c.json({ error: "not_found" }, 404);
    return c.json(g);
  },
);

/** Reassign every media item from one genre to another (then optionally
 *  delete the source genre). */
genres.post(
  "/replace",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      fromGenreId: z.string().min(1),
      toGenreId: z.string().min(1),
      deleteSource: z.boolean().default(false),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const { fromGenreId, toGenreId, deleteSource } = c.req.valid("json");
    if (fromGenreId === toGenreId) return c.json({ error: "same_genre" }, 400);

    const rows = await prisma.mediaGenre.findMany({
      where: { genreId: fromGenreId },
      select: { mediaItemId: true },
    });
    await prisma.mediaGenre.createMany({
      data: rows.map((r) => ({ mediaItemId: r.mediaItemId, genreId: toGenreId })),
      skipDuplicates: true,
    });
    await prisma.mediaGenre.deleteMany({ where: { genreId: fromGenreId } });
    if (deleteSource) {
      await prisma.genre.delete({ where: { id: fromGenreId } }).catch(() => {});
    }
    return c.json({ reassigned: rows.length });
  },
);

genres.delete("/:id", requireAdmin, async (c) => {
  await c
    .get("prisma")
    .genre.delete({ where: { id: c.req.param("id") } })
    .catch(() => {});
  return c.json({ deleted: true });
});
