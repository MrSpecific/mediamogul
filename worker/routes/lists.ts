import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { mediaType, visibility } from "../schemas";
import type { AppEnv } from "../types";

export const lists = new Hono<AppEnv>();

const listInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  visibility: visibility.default("PRIVATE"),
  /** Empty array = any media type allowed. */
  allowedTypes: z.array(mediaType).default([]),
  ranked: z.boolean().default(false),
});

lists.post("/", zValidator("json", listInput), async (c) => {
  const list = await c.get("prisma").mediaList.create({
    data: { ...c.req.valid("json"), ownerId: c.get("user").id },
  });
  return c.json(list, 201);
});

lists.get("/:id", async (c) => {
  const prisma = c.get("prisma");
  const userId = c.get("user").id;
  const list = await prisma.mediaList.findUnique({
    where: { id: c.req.param("id") },
    include: {
      owner: { select: { username: true, displayName: true, avatarUrl: true } },
      items: {
        orderBy: [{ position: "asc" }, { addedAt: "asc" }],
        include: { mediaItem: true },
      },
      _count: { select: { items: true, savedBy: true } },
    },
  });
  if (!list) return c.json({ error: "not_found" }, 404);
  // Private lists are visible to their owner only.
  if (list.visibility === "PRIVATE" && list.ownerId !== userId) {
    return c.json({ error: "not_found" }, 404);
  }
  const saved = await prisma.savedList.findUnique({
    where: { userId_listId: { userId, listId: list.id } },
  });
  return c.json({ ...list, isOwner: list.ownerId === userId, isSaved: !!saved });
});

lists.patch("/:id", zValidator("json", listInput.partial()), async (c) => {
  const res = await c.get("prisma").mediaList.updateMany({
    where: { id: c.req.param("id"), ownerId: c.get("user").id },
    data: c.req.valid("json"),
  });
  if (res.count === 0) return c.json({ error: "not_found" }, 404);
  const list = await c
    .get("prisma")
    .mediaList.findUnique({ where: { id: c.req.param("id") } });
  return c.json(list);
});

lists.delete("/:id", async (c) => {
  const res = await c.get("prisma").mediaList.deleteMany({
    where: { id: c.req.param("id"), ownerId: c.get("user").id },
  });
  if (res.count === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ deleted: true });
});

// --- items -----------------------------------------------------------------

lists.post(
  "/:id/items",
  zValidator(
    "json",
    z.object({
      mediaItemId: z.string().min(1),
      note: z.string().max(1000).optional(),
      position: z.number().int().optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    const listId = c.req.param("id");
    const { mediaItemId, note, position } = c.req.valid("json");

    const list = await prisma.mediaList.findUnique({
      where: { id: listId },
      select: { ownerId: true, allowedTypes: true },
    });
    if (!list || list.ownerId !== c.get("user").id) {
      return c.json({ error: "not_found" }, 404);
    }

    const item = await prisma.mediaItem.findUnique({
      where: { id: mediaItemId },
      select: { type: true },
    });
    if (!item) return c.json({ error: "media_not_found" }, 404);
    if (list.allowedTypes.length && !list.allowedTypes.includes(item.type)) {
      return c.json(
        { error: "type_not_allowed", allowedTypes: list.allowedTypes },
        400,
      );
    }

    const created = await prisma.mediaListItem.upsert({
      where: { listId_mediaItemId: { listId, mediaItemId } },
      create: { listId, mediaItemId, note, position: position ?? 0 },
      update: { note, ...(position !== undefined ? { position } : {}) },
      include: { mediaItem: true },
    });
    return c.json(created, 201);
  },
);

lists.delete("/:id/items/:itemId", async (c) => {
  const prisma = c.get("prisma");
  const list = await prisma.mediaList.findUnique({
    where: { id: c.req.param("id") },
    select: { ownerId: true },
  });
  if (!list || list.ownerId !== c.get("user").id) {
    return c.json({ error: "not_found" }, 404);
  }
  const res = await prisma.mediaListItem.deleteMany({
    where: { id: c.req.param("itemId"), listId: c.req.param("id") },
  });
  return c.json({ deleted: res.count });
});

// --- save / follow a list --------------------------------------------------

lists.put("/:id/save", async (c) => {
  const prisma = c.get("prisma");
  const listId = c.req.param("id");
  const list = await prisma.mediaList.findUnique({
    where: { id: listId },
    select: { visibility: true, ownerId: true },
  });
  if (!list || (list.visibility === "PRIVATE" && list.ownerId !== c.get("user").id)) {
    return c.json({ error: "not_found" }, 404);
  }
  await prisma.savedList.upsert({
    where: { userId_listId: { userId: c.get("user").id, listId } },
    create: { userId: c.get("user").id, listId },
    update: {},
  });
  return c.json({ saved: true });
});

lists.delete("/:id/save", async (c) => {
  await c
    .get("prisma")
    .savedList.delete({
      where: {
        userId_listId: {
          userId: c.get("user").id,
          listId: c.req.param("id"),
        },
      },
    })
    .catch(() => undefined);
  return c.json({ saved: false });
});
