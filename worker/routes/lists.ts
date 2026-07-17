import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { mediaType, username, visibility } from "../schemas";
import { type TierId, tierLimit } from "../../shared/tiers";
import { requireFeature } from "../tiers";
import type { PrismaClient } from "../generated/prisma/client";
import type { AppEnv } from "../types";

export const lists = new Hono<AppEnv>();

/** Owner or an ACCEPTED collaborator may edit a list (items + notes). */
async function canEditList(
  prisma: PrismaClient,
  listId: string,
  userId: string,
): Promise<boolean> {
  const list = await prisma.mediaList.findUnique({
    where: { id: listId },
    select: { ownerId: true },
  });
  if (!list) return false;
  if (list.ownerId === userId) return true;
  const collab = await prisma.listCollaborator.findUnique({
    where: { listId_userId: { listId, userId } },
    select: { status: true },
  });
  return collab?.status === "ACCEPTED";
}

/** Bump a list's updatedAt when its items change (add / remove / reorder), so
 *  the owner's Lists page re-sorts it to the top. Providing the value is a
 *  no-op vs. @updatedAt's own now() — either way it lands at ~now. */
function touchList(prisma: PrismaClient, listId: string) {
  return prisma.mediaList.update({
    where: { id: listId },
    data: { updatedAt: new Date() },
  });
}

const listInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  /** A curated list-icon handle (see src/lib/list-icons.tsx), or null to clear. */
  icon: z.string().max(64).nullable().optional(),
  visibility: visibility.default("PRIVATE"),
  /** Empty array = any media type allowed. */
  allowedTypes: z.array(mediaType).default([]),
  ranked: z.boolean().default(false),
});

lists.post("/", zValidator("json", listInput), async (c) => {
  const prisma = c.get("prisma");
  const ownerId = c.get("user").id;

  // Config-driven tier limit (see shared/tiers.ts — FREE caps lists, STANDARD
  // is unlimited). Adjust or remove by editing the tier config.
  const limit = tierLimit(c.get("profile").tier as TierId, "lists");
  if (limit !== null) {
    const count = await prisma.mediaList.count({ where: { ownerId } });
    if (count >= limit) {
      return c.json(
        { error: "upgrade_required", reason: "list_limit_reached", limit },
        402,
      );
    }
  }

  const list = await prisma.mediaList.create({
    data: { ...c.req.valid("json"), ownerId },
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
      collaborators: {
        include: {
          user: {
            select: { username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { items: true, savedBy: true } },
    },
  });
  if (!list) return c.json({ error: "not_found" }, 404);
  const isOwner = list.ownerId === userId;
  const myCollab = list.collaborators.find((x) => x.userId === userId);
  // Private lists are visible to the owner and to anyone invited (so a pending
  // invitee can view it before accepting).
  if (list.visibility === "PRIVATE" && !isOwner && !myCollab) {
    return c.json({ error: "not_found" }, 404);
  }
  const [saved, starred] = await Promise.all([
    prisma.savedList.findUnique({
      where: { userId_listId: { userId, listId: list.id } },
    }),
    prisma.starredList.findUnique({
      where: { userId_listId: { userId, listId: list.id } },
    }),
  ]);
  return c.json({
    ...list,
    isOwner,
    isSaved: !!saved,
    isStarred: !!starred,
    canEdit: isOwner || myCollab?.status === "ACCEPTED",
    myCollabStatus: myCollab?.status ?? null,
  });
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
    if (!list) return c.json({ error: "not_found" }, 404);
    if (!(await canEditList(prisma, listId, c.get("user").id))) {
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
    await touchList(prisma, listId);
    return c.json(created, 201);
  },
);

/** Reorder a list's items. Body lists every current mediaItemId in the desired
 *  order; positions are rewritten to 0..N-1 to match. */
lists.put(
  "/:id/order",
  zValidator("json", z.object({ order: z.array(z.string().min(1)).min(1) })),
  async (c) => {
    const prisma = c.get("prisma");
    const listId = c.req.param("id");
    if (!(await canEditList(prisma, listId, c.get("user").id))) {
      return c.json({ error: "not_found" }, 404);
    }
    const { order } = c.req.valid("json");

    // The payload must be a permutation of the list's current items — reject
    // anything else so a stale client can't drop or invent members.
    const existing = await prisma.mediaListItem.findMany({
      where: { listId },
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

    // position isn't unique on MediaListItem, so a straight 0..N-1 rewrite is
    // safe (no two-phase parking needed).
    await prisma.$transaction([
      ...order.map((mediaItemId, i) =>
        prisma.mediaListItem.updateMany({
          where: { listId, mediaItemId },
          data: { position: i },
        }),
      ),
      touchList(prisma, listId),
    ]);
    return c.json({ ok: true });
  },
);

lists.delete("/:id/items/:itemId", async (c) => {
  const prisma = c.get("prisma");
  if (!(await canEditList(prisma, c.req.param("id"), c.get("user").id))) {
    return c.json({ error: "not_found" }, 404);
  }
  const res = await prisma.mediaListItem.deleteMany({
    where: { id: c.req.param("itemId"), listId: c.req.param("id") },
  });
  if (res.count) await touchList(prisma, c.req.param("id"));
  return c.json({ deleted: res.count });
});

/** Remove a media item from a list by its media id (the caller usually knows
 *  the media id, not the list-item row id — e.g. the Add-to-list dialog). */
lists.delete("/:id/items/by-media/:mediaId", async (c) => {
  const prisma = c.get("prisma");
  const listId = c.req.param("id");
  if (!(await canEditList(prisma, listId, c.get("user").id))) {
    return c.json({ error: "not_found" }, 404);
  }
  const res = await prisma.mediaListItem.deleteMany({
    where: { listId, mediaItemId: c.req.param("mediaId") },
  });
  if (res.count) await touchList(prisma, listId);
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

// --- star a list (pin prominently, e.g. on the homepage) -------------------

/** Any list the user can see may be starred: their own, a public one, or one
 *  they collaborate on. */
async function canViewList(
  prisma: PrismaClient,
  listId: string,
  userId: string,
): Promise<boolean> {
  const list = await prisma.mediaList.findUnique({
    where: { id: listId },
    select: { ownerId: true, visibility: true },
  });
  if (!list) return false;
  if (list.visibility === "PUBLIC" || list.ownerId === userId) return true;
  const collab = await prisma.listCollaborator.findUnique({
    where: { listId_userId: { listId, userId } },
    select: { userId: true },
  });
  return !!collab;
}

lists.put("/:id/star", async (c) => {
  const prisma = c.get("prisma");
  const listId = c.req.param("id");
  if (!(await canViewList(prisma, listId, c.get("user").id))) {
    return c.json({ error: "not_found" }, 404);
  }
  await prisma.starredList.upsert({
    where: { userId_listId: { userId: c.get("user").id, listId } },
    create: { userId: c.get("user").id, listId },
    update: {},
  });
  return c.json({ starred: true });
});

lists.delete("/:id/star", async (c) => {
  await c
    .get("prisma")
    .starredList.delete({
      where: {
        userId_listId: { userId: c.get("user").id, listId: c.req.param("id") },
      },
    })
    .catch(() => undefined);
  return c.json({ starred: false });
});

// --- shared lists: invite + respond to collaboration -----------------------

lists.post(
  "/:id/invite",
  // Shared/collaborative lists are a Standard feature.
  requireFeature("sharedLists"),
  zValidator("json", z.object({ username })),
  async (c) => {
    const prisma = c.get("prisma");
    const listId = c.req.param("id");
    const inviterId = c.get("user").id;
    const list = await prisma.mediaList.findUnique({
      where: { id: listId },
      select: { ownerId: true, title: true },
    });
    // Only the owner may invite.
    if (!list || list.ownerId !== inviterId) {
      return c.json({ error: "not_found" }, 404);
    }
    const invitee = await prisma.user.findUnique({
      where: { username: c.req.valid("json").username },
      select: { id: true },
    });
    if (!invitee) return c.json({ error: "user_not_found" }, 404);
    if (invitee.id === inviterId) {
      return c.json({ error: "cannot_invite_self" }, 400);
    }
    const existing = await prisma.listCollaborator.findUnique({
      where: { listId_userId: { listId, userId: invitee.id } },
      select: { status: true },
    });
    if (existing?.status === "ACCEPTED") {
      return c.json({ error: "already_collaborator" }, 409);
    }
    const inviter = c.get("profile");
    const who = inviter.displayName || inviter.username;
    // Upsert the (pending) collaborator row and notify the invitee together.
    await prisma.$transaction([
      prisma.listCollaborator.upsert({
        where: { listId_userId: { listId, userId: invitee.id } },
        create: {
          listId,
          userId: invitee.id,
          invitedById: inviterId,
          status: "PENDING",
        },
        update: { invitedById: inviterId, status: "PENDING" },
      }),
      prisma.notification.create({
        data: {
          userId: invitee.id,
          type: "LIST_INVITE",
          actorId: inviterId,
          listId,
          message: `${who} invited you to collaborate on “${list.title}”`,
        },
      }),
    ]);
    return c.json({ invited: true }, 201);
  },
);

lists.post(
  "/:id/collaboration/respond",
  zValidator("json", z.object({ accept: z.boolean() })),
  async (c) => {
    const prisma = c.get("prisma");
    const listId = c.req.param("id");
    const userId = c.get("user").id;
    const collab = await prisma.listCollaborator.findUnique({
      where: { listId_userId: { listId, userId } },
      select: {
        status: true,
        invitedById: true,
        list: { select: { title: true } },
      },
    });
    if (!collab) return c.json({ error: "not_found" }, 404);
    if (c.req.valid("json").accept) {
      const me = c.get("profile");
      const who = me.displayName || me.username;
      // Flip to ACCEPTED and notify the inviter together. Only the PENDING →
      // ACCEPTED transition notifies, so re-accepting can't re-notify.
      await prisma.$transaction([
        prisma.listCollaborator.update({
          where: { listId_userId: { listId, userId } },
          data: { status: "ACCEPTED" },
        }),
        ...(collab.status === "PENDING"
          ? [
              prisma.notification.create({
                data: {
                  userId: collab.invitedById,
                  type: "LIST_INVITE_ACCEPTED",
                  actorId: userId,
                  listId,
                  message: `${who} accepted your invite to collaborate on “${collab.list.title}”`,
                },
              }),
            ]
          : []),
      ]);
      return c.json({ status: "ACCEPTED" });
    }
    await prisma.listCollaborator.delete({
      where: { listId_userId: { listId, userId } },
    });
    return c.json({ status: "DECLINED" });
  },
);

// Owner removes a collaborator; a collaborator may remove themselves.
lists.delete("/:id/collaborators/:userId", async (c) => {
  const prisma = c.get("prisma");
  const listId = c.req.param("id");
  const targetId = c.req.param("userId");
  const meId = c.get("user").id;
  const list = await prisma.mediaList.findUnique({
    where: { id: listId },
    select: { ownerId: true },
  });
  if (!list) return c.json({ error: "not_found" }, 404);
  if (list.ownerId !== meId && targetId !== meId) {
    return c.json({ error: "forbidden" }, 403);
  }
  await prisma.listCollaborator.deleteMany({
    where: { listId, userId: targetId },
  });
  return c.json({ removed: true });
});
