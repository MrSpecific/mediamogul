import { Hono } from "hono";
import type { Context } from "hono";
import { getPrisma } from "../db";
import type { AppEnv } from "../types";

// Public, unauthenticated media data. Only PUBLIC, non-archived items.
export const publicRoutes = new Hono<{ Bindings: Env }>();

async function loadPublicMedia(env: Env, id: string) {
  const prisma = getPrisma(env);
  const item = await prisma.mediaItem.findFirst({
    where: { id, visibility: "PUBLIC", archivedAt: null },
    include: {
      credits: { orderBy: { position: "asc" } },
      streaming: { orderBy: { provider: "asc" } },
      genres: { include: { genre: true } },
      assets: {
        where: { kind: "COVER" },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          url: true,
          isPrimary: true,
          edition: true,
          editionYear: true,
          publisher: true,
          sourceName: true,
          sourceUrl: true,
          license: true,
          creator: true,
        },
      },
    },
  });
  if (!item) return null;
  const agg = await prisma.rating.aggregate({
    where: { mediaItemId: id },
    _avg: { stars: true },
    _count: true,
  });
  const { genres, assets, ...rest } = item;
  // Fall back to the denormalized coverImageUrl for legacy items whose cover
  // was never linked as an asset — so the gallery always has something to show.
  const covers =
    assets.length > 0
      ? assets
      : rest.coverImageUrl
        ? [{ id: "primary", url: rest.coverImageUrl, isPrimary: true }]
        : [];
  return {
    ...rest,
    genres: genres.map((g) => g.genre),
    covers,
    averageRating: agg._avg.stars == null ? null : Number(agg._avg.stars),
    ratingCount: agg._count,
  };
}

publicRoutes.get("/media/:id", async (c) => {
  const media = await loadPublicMedia(c.env, c.req.param("id"));
  if (!media) return c.json({ error: "not_found" }, 404);
  return c.json(media);
});

/**
 * Public, unauthenticated profile by username. Only returned when the profile
 * is public and the account is active; otherwise 404 (so private/deactivated
 * profiles are indistinguishable from nonexistent ones to logged-out visitors).
 */
publicRoutes.get("/users/:username", async (c) => {
  const prisma = getPrisma(c.env);
  const user = await prisma.user.findFirst({
    where: {
      username: c.req.param("username"),
      profilePublic: true,
      deactivatedAt: null,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
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
  return c.json({ ...user, profilePublic: true, viewer: { isOwner: false, isAdmin: false, canFollow: false } });
});

// --- OpenGraph HTML injection for /m/:id ----------------------------------

class SetAttr {
  attrName: string;
  attrValue: string;
  constructor(name: string, value: string) {
    this.attrName = name;
    this.attrValue = value;
  }
  element(el: Element) {
    el.setAttribute(this.attrName, this.attrValue);
  }
}
class SetText {
  content: string;
  constructor(content: string) {
    this.content = content;
  }
  element(el: Element) {
    el.setInnerContent(this.content);
  }
}

/**
 * Serves the SPA shell for /m/:id with per-media OpenGraph tags injected
 * (title, description, and the cover image) so shared links preview nicely.
 * Falls back to the unmodified shell when the item isn't public.
 */
export async function renderMediaOg(c: Context<AppEnv>): Promise<Response> {
  const origin = new URL(c.req.url).origin;
  const shell = await c.env.ASSETS.fetch(new URL("/index.html", origin));

  const id = c.req.param("id");
  if (!id) return shell;
  const media = await loadPublicMedia(c.env, id).catch(() => null);
  if (!media) return shell;

  const abs = (u: string) => new URL(u, origin).toString();
  const title = media.title;
  const description =
    media.shortDescription ||
    media.synopsis?.slice(0, 200) ||
    "Track it on mediamogul.";
  const image = media.coverImageUrl
    ? abs(media.coverImageUrl)
    : abs("/og.png");

  return new HTMLRewriter()
    .on("title", new SetText(`${title} · mediamogul`))
    .on('meta[property="og:title"]', new SetAttr("content", title))
    .on('meta[property="og:description"]', new SetAttr("content", description))
    .on('meta[property="og:image"]', new SetAttr("content", image))
    .on('meta[property="og:type"]', new SetAttr("content", "article"))
    .on('meta[property="og:url"]', new SetAttr("content", `${origin}/m/${media.id}`))
    .on('meta[name="twitter:title"]', new SetAttr("content", title))
    .on('meta[name="twitter:description"]', new SetAttr("content", description))
    .on('meta[name="twitter:image"]', new SetAttr("content", image))
    .transform(shell);
}
