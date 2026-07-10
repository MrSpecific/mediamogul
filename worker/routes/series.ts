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
        include: { mediaItem: true },
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

series.delete("/:id/items/:mediaItemId", requireAdmin, async (c) => {
  const res = await c.get("prisma").seriesEntry.deleteMany({
    where: {
      seriesId: c.req.param("id"),
      mediaItemId: c.req.param("mediaItemId"),
    },
  });
  return c.json({ deleted: res.count });
});
