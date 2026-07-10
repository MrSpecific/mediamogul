import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getOrCreateUser } from "../db";
import { isAdmin } from "../auth";
import { username } from "../schemas";
import type { AppEnv } from "../types";

export const me = new Hono<AppEnv>();

/** Current user's profile (created on first call), plus admin flag. */
me.get("/", async (c) => {
  const profile = await getOrCreateUser(c.get("prisma"), c.get("user"));
  return c.json({ ...profile, isAdmin: isAdmin(c.get("user")) });
});

me.patch(
  "/",
  zValidator(
    "json",
    z.object({
      username: username.optional(),
      displayName: z.string().max(80).nullable().optional(),
      bio: z.string().max(500).nullable().optional(),
      avatarUrl: z.string().url().nullable().optional(),
    }),
  ),
  async (c) => {
    const prisma = c.get("prisma");
    await getOrCreateUser(prisma, c.get("user"));
    try {
      const updated = await prisma.user.update({
        where: { id: c.get("user").id },
        data: c.req.valid("json"),
      });
      return c.json(updated);
    } catch {
      return c.json({ error: "username_taken" }, 409);
    }
  },
);

/** Recent activity: the user's own consumption entries. */
me.get("/entries", async (c) => {
  const entries = await c.get("prisma").mediaEntry.findMany({
    where: { userId: c.get("user").id },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: { mediaItem: true },
  });
  return c.json(entries);
});

/** The user's own lists plus lists they've saved. */
me.get("/lists", async (c) => {
  const prisma = c.get("prisma");
  const uid = c.get("user").id;
  const [owned, saved] = await Promise.all([
    prisma.mediaList.findMany({
      where: { ownerId: uid },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.savedList.findMany({
      where: { userId: uid },
      include: {
        list: {
          include: { _count: { select: { items: true } }, owner: true },
        },
      },
    }),
  ]);
  return c.json({ owned, saved: saved.map((s) => s.list) });
});
