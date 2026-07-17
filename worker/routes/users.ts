import { Hono } from "hono";
import { getOrCreateUser } from "../db";
import { isAdmin } from "../auth";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { AppEnv } from "../types";

export const users = new Hono<AppEnv>();

/** Thin user projection for follower/following rosters. */
const USER_SUMMARY = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

/** A few cover thumbnails per list for the profile's list-card previews. */
const PROFILE_LIST_PREVIEW: Prisma.MediaList$itemsArgs = {
  take: 6,
  orderBy: [{ position: "asc" }, { addedAt: "asc" }],
  select: {
    id: true,
    mediaItem: {
      select: { id: true, type: true, title: true, coverImageUrl: true },
    },
  },
};

const ROSTER_PAGE = 20;

type RosterUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/** Annotate a roster page with the viewer's follow state + self flag, so each
 *  row can render the right Follow / Following / (nothing, for self) control. */
async function attachFollowState(
  prisma: PrismaClient,
  viewerId: string,
  roster: RosterUser[],
) {
  const ids = roster.map((u) => u.id);
  const following = new Set<string>();
  if (ids.length) {
    const mine = await prisma.follow.findMany({
      where: { followerId: viewerId, followingId: { in: ids } },
      select: { followingId: true },
    });
    for (const f of mine) following.add(f.followingId);
  }
  return roster.map((u) => ({
    ...u,
    isFollowing: following.has(u.id),
    isSelf: u.id === viewerId,
  }));
}

/**
 * Profile by username for signed-in viewers, with follow counts, whether you
 * follow them, and a `viewer` context (isOwner / isAdmin / canFollow) that the
 * UI uses to pick the self / other / admin variant. Private profiles are only
 * visible to their owner and to admins; everyone else gets 403 with a minimal
 * identity so the UI can show a graceful "private profile" state.
 */
users.get("/:username", async (c) => {
  const prisma = c.get("prisma");
  const viewer = c.get("user");
  const viewerIsAdmin = isAdmin(viewer, c.env, c.get("profile"));
  const user = await prisma.user.findUnique({
    where: { username: c.req.param("username") },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      profilePublic: true,
      deactivatedAt: true,
      createdAt: true,
      _count: {
        select: {
          followers: true,
          following: true,
          entries: true,
          reviews: true,
          lists: true,
        },
      },
    },
  });
  if (!user) return c.json({ error: "not_found" }, 404);

  const isOwner = user.id === viewer.id;
  if (!user.profilePublic && !isOwner && !viewerIsAdmin) {
    return c.json(
      {
        error: "private",
        user: {
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        viewer: { isOwner: false, isAdmin: false, canFollow: false },
      },
      403,
    );
  }

  const rel = isOwner
    ? null
    : await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewer.id,
            followingId: user.id,
          },
        },
      });
  return c.json({
    ...user,
    isFollowing: !!rel,
    viewer: { isOwner, isAdmin: viewerIsAdmin, canFollow: !isOwner },
  });
});

/**
 * A user's PUBLIC lists, for display on their profile. Each list carries item
 * counts + preview thumbnails, plus `isSaved` (whether the viewer already
 * follows/saved it) and `isOwner` so the UI can pick Save / Following / (none).
 */
users.get("/:username/lists", async (c) => {
  const prisma = c.get("prisma");
  const viewer = c.get("user");
  const target = await prisma.user.findUnique({
    where: { username: c.req.param("username") },
    select: { id: true },
  });
  if (!target) return c.json({ error: "not_found" }, 404);

  const lists = await prisma.mediaList.findMany({
    where: { ownerId: target.id, visibility: "PUBLIC" },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { items: true, collaborators: true } },
      items: PROFILE_LIST_PREVIEW,
      owner: { select: { username: true, displayName: true } },
    },
  });
  const savedRows = await prisma.savedList.findMany({
    where: { userId: viewer.id, listId: { in: lists.map((l) => l.id) } },
    select: { listId: true },
  });
  const saved = new Set(savedRows.map((s) => s.listId));
  return c.json(
    lists.map((l) => ({
      ...l,
      isSaved: saved.has(l.id),
      isOwner: l.ownerId === viewer.id,
    })),
  );
});

/** Users who follow :username (newest first), viewer follow-state attached. */
users.get("/:username/followers", async (c) => {
  const prisma = c.get("prisma");
  const viewer = c.get("user");
  const target = await prisma.user.findUnique({
    where: { username: c.req.param("username") },
    select: { id: true },
  });
  if (!target) return c.json({ error: "not_found" }, 404);

  const cursor = c.req.query("cursor");
  const rows = await prisma.follow.findMany({
    where: { followingId: target.id },
    orderBy: [{ createdAt: "desc" }, { followerId: "asc" }],
    take: ROSTER_PAGE + 1,
    ...(cursor
      ? {
          skip: 1,
          cursor: {
            followerId_followingId: {
              followerId: cursor,
              followingId: target.id,
            },
          },
        }
      : {}),
    select: { follower: { select: USER_SUMMARY } },
  });
  const page = rows.slice(0, ROSTER_PAGE).map((r) => r.follower);
  const nextCursor =
    rows.length > ROSTER_PAGE ? page[page.length - 1].id : null;
  return c.json({
    items: await attachFollowState(prisma, viewer.id, page),
    nextCursor,
  });
});

/** Users :username follows (newest first), viewer follow-state attached. */
users.get("/:username/following", async (c) => {
  const prisma = c.get("prisma");
  const viewer = c.get("user");
  const target = await prisma.user.findUnique({
    where: { username: c.req.param("username") },
    select: { id: true },
  });
  if (!target) return c.json({ error: "not_found" }, 404);

  const cursor = c.req.query("cursor");
  const rows = await prisma.follow.findMany({
    where: { followerId: target.id },
    orderBy: [{ createdAt: "desc" }, { followingId: "asc" }],
    take: ROSTER_PAGE + 1,
    ...(cursor
      ? {
          skip: 1,
          cursor: {
            followerId_followingId: {
              followerId: target.id,
              followingId: cursor,
            },
          },
        }
      : {}),
    select: { following: { select: USER_SUMMARY } },
  });
  const page = rows.slice(0, ROSTER_PAGE).map((r) => r.following);
  const nextCursor =
    rows.length > ROSTER_PAGE ? page[page.length - 1].id : null;
  return c.json({
    items: await attachFollowState(prisma, viewer.id, page),
    nextCursor,
  });
});

users.put("/:username/follow", async (c) => {
  const prisma = c.get("prisma");
  await getOrCreateUser(prisma, c.get("user"));
  const target = await prisma.user.findUnique({
    where: { username: c.req.param("username") },
    select: { id: true },
  });
  if (!target) return c.json({ error: "not_found" }, 404);
  if (target.id === c.get("user").id) {
    return c.json({ error: "cannot_follow_self" }, 400);
  }
  await prisma.follow.upsert({
    where: {
      followerId_followingId: {
        followerId: c.get("user").id,
        followingId: target.id,
      },
    },
    create: { followerId: c.get("user").id, followingId: target.id },
    update: {},
  });
  return c.json({ following: true });
});

users.delete("/:username/follow", async (c) => {
  const prisma = c.get("prisma");
  const target = await prisma.user.findUnique({
    where: { username: c.req.param("username") },
    select: { id: true },
  });
  if (!target) return c.json({ error: "not_found" }, 404);
  await prisma.follow
    .delete({
      where: {
        followerId_followingId: {
          followerId: c.get("user").id,
          followingId: target.id,
        },
      },
    })
    .catch(() => undefined);
  return c.json({ following: false });
});
