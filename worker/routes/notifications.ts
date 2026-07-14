import { Hono } from "hono";
import type { AppEnv } from "../types";

export const notifications = new Hono<AppEnv>();

/** Recent notifications for the current user (newest first). */
notifications.get("/", async (c) => {
  const rows = await c.get("prisma").notification.findMany({
    where: { userId: c.get("user").id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actor: {
        select: { username: true, displayName: true, avatarUrl: true },
      },
      list: { select: { id: true, title: true } },
    },
  });
  return c.json(rows);
});

/** Unread count — polled by the nav bell. */
notifications.get("/unread-count", async (c) => {
  const count = await c.get("prisma").notification.count({
    where: { userId: c.get("user").id, readAt: null },
  });
  return c.json({ count });
});

notifications.post("/:id/read", async (c) => {
  await c.get("prisma").notification.updateMany({
    where: { id: c.req.param("id"), userId: c.get("user").id },
    data: { readAt: new Date() },
  });
  return c.json({ ok: true });
});

notifications.post("/read-all", async (c) => {
  await c.get("prisma").notification.updateMany({
    where: { userId: c.get("user").id, readAt: null },
    data: { readAt: new Date() },
  });
  return c.json({ ok: true });
});
