import { Hono } from "hono";
import { getOrCreateUser } from "../db";
import { isAdmin } from "../auth";
import type { AppEnv } from "../types";

export const users = new Hono<AppEnv>();

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
