import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { requireAdmin } from "../auth";
import { mediaType, ratingSystem } from "../schemas";
import type { AppEnv } from "../types";

export const contentRatings = new Hono<AppEnv>();

/** List content ratings, optionally limited to those applicable to a media
 *  type (empty applicableTypes = all types). Ordered by system then severity. */
contentRatings.get(
  "/",
  zValidator("query", z.object({ type: mediaType.optional() })),
  async (c) => {
    const { type } = c.req.valid("query");
    const where: Prisma.ContentRatingWhereInput = type
      ? {
          OR: [
            { applicableTypes: { has: type } },
            { applicableTypes: { isEmpty: true } },
          ],
        }
      : {};
    const rows = await c.get("prisma").contentRating.findMany({
      where,
      orderBy: [{ system: "asc" }, { rank: "asc" }],
      include: { _count: { select: { media: true } } },
    });
    return c.json(rows);
  },
);

// --- admin only ------------------------------------------------------------

const ratingInput = z.object({
  system: ratingSystem,
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  applicableTypes: z.array(mediaType).default([]),
  rank: z.number().int().min(0).max(100).default(0),
});

contentRatings.post("/", requireAdmin, zValidator("json", ratingInput), async (c) => {
  const data = c.req.valid("json");
  try {
    const row = await c.get("prisma").contentRating.create({ data });
    return c.json(row, 201);
  } catch {
    return c.json({ error: "rating_exists" }, 409);
  }
});

contentRatings.patch(
  "/:id",
  requireAdmin,
  zValidator("json", ratingInput.partial()),
  async (c) => {
    const prisma = c.get("prisma");
    const exists = await prisma.contentRating.findUnique({
      where: { id: c.req.param("id") },
      select: { id: true },
    });
    if (!exists) return c.json({ error: "not_found" }, 404);
    const row = await prisma.contentRating
      .update({ where: { id: c.req.param("id") }, data: c.req.valid("json") })
      .catch(() => null);
    if (!row) return c.json({ error: "rating_exists" }, 409);
    return c.json(row);
  },
);

contentRatings.delete("/:id", requireAdmin, async (c) => {
  // FK is onDelete: SetNull, so any media pointing here simply lose the rating.
  await c
    .get("prisma")
    .contentRating.delete({ where: { id: c.req.param("id") } })
    .catch(() => {});
  return c.json({ deleted: true });
});
