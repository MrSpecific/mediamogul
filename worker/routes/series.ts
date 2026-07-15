import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAdmin } from "../auth";
import type { AppEnv } from "../types";

export const series = new Hono<AppEnv>();

series.post(
  "/",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      title: z.string().min(1).max(300),
      description: z.string().max(2000).optional(),
    }),
  ),
  async (c) => {
    const created = await c.get("prisma").series.create({
      data: { ...c.req.valid("json"), createdById: c.get("user").id },
    });
    return c.json(created, 201);
  },
);

series.get("/:id", async (c) => {
  const s = await c.get("prisma").series.findUnique({
    where: { id: c.req.param("id") },
    include: {
      entries: {
        orderBy: { position: "asc" },
        include: {
          // Credits drive the per-card byline (author/director/etc).
          mediaItem: {
            include: { credits: { orderBy: { position: "asc" } } },
          },
        },
      },
    },
  });
  if (!s) return c.json({ error: "not_found" }, 404);
  return c.json(s);
});

series.post(
  "/:id/items",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      mediaItemId: z.string().min(1),
      position: z.number().int().min(1),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const seriesId = c.req.param("id");
    const { mediaItemId, position } = c.req.valid("json");
    try {
      const entry = await prisma.seriesEntry.upsert({
        where: { seriesId_mediaItemId: { seriesId, mediaItemId } },
        create: { seriesId, mediaItemId, position },
        update: { position },
        include: { mediaItem: true },
      });
      return c.json(entry, 201);
    } catch {
      // Likely a duplicate position within the series.
      return c.json({ error: "position_taken" }, 409);
    }
  },
);

// Reorder the whole series. Body lists every current mediaItemId in the
// desired order; positions are rewritten to 1..N to match.
series.put(
  "/:id/order",
  requireAdmin,
  zValidator(
    "json",
    z.object({ order: z.array(z.string().min(1)).min(1) }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const seriesId = c.req.param("id");
    const { order } = c.req.valid("json");

    // The payload must be a permutation of the series' current entries —
    // reject anything else so a stale client can't drop or invent members.
    const existing = await prisma.seriesEntry.findMany({
      where: { seriesId },
      select: { mediaItemId: true },
    });
    const existingIds = new Set(existing.map((e) => e.mediaItemId));
    const orderSet = new Set(order);
    if (
      order.length !== existingIds.size ||
      orderSet.size !== order.length ||
      !order.every((mediaItemId) => existingIds.has(mediaItemId))
    ) {
      return c.json({ error: "order_mismatch" }, 400);
    }

    // Two phases in one transaction to sidestep the (seriesId, position)
    // unique constraint: first park every row at a negative position (which
    // can't clash with any existing positive one), then assign 1..N.
    await prisma.$transaction([
      ...order.map((mediaItemId, i) =>
        prisma.seriesEntry.update({
          where: { seriesId_mediaItemId: { seriesId, mediaItemId } },
          data: { position: -(i + 1) },
        }),
      ),
      ...order.map((mediaItemId, i) =>
        prisma.seriesEntry.update({
          where: { seriesId_mediaItemId: { seriesId, mediaItemId } },
          data: { position: i + 1 },
        }),
      ),
    ]);

    return c.json({ ok: true });
  },
);

series.delete("/:id/items/:mediaItemId", requireAdmin, async (c) => {
  const res = await c.get("prisma").seriesEntry.deleteMany({
    where: {
      seriesId: c.req.param("id"),
      mediaItemId: c.req.param("mediaItemId"),
    },
  });
  return c.json({ deleted: res.count });
});
