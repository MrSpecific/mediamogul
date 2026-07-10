import { Hono } from "hono";
import { getOrCreateUser } from "../db";
import type { AppEnv } from "../types";

export const users = new Hono<AppEnv>();

/** Public profile by username, with follow counts and whether you follow them. */
users.get("/:username", async (c) => {
  const prisma = c.get("prisma");
  const user = await prisma.user.findUnique({
    where: { username: c.req.param("username") },
    include: {
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

  const rel = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: c.get("user").id,
        followingId: user.id,
      },
    },
  });
  return c.json({ ...user, isFollowing: !!rel });
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
