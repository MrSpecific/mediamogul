import type { MediaType, PrismaClient } from "../generated/prisma/client";

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Find or create a genre by name (case/format-insensitive via slug), ensuring
 * `type` is among its applicable types. Used when scraping surfaces a genre
 * string that may not exist yet.
 */
export async function resolveGenreId(
  prisma: PrismaClient,
  name: string,
  type: MediaType,
): Promise<string> {
  const slug = slugify(name);
  const existing = await prisma.genre.findFirst({
    where: { OR: [{ slug }, { name }] },
  });
  if (existing) {
    if (!existing.applicableTypes.includes(type)) {
      await prisma.genre.update({
        where: { id: existing.id },
        data: { applicableTypes: { push: type } },
      });
    }
    return existing.id;
  }
  const created = await prisma.genre.create({
    data: { name, slug, applicableTypes: [type] },
  });
  return created.id;
}

/** Attach genres to a media item (ignores duplicates). */
export async function linkGenres(
  prisma: PrismaClient,
  mediaItemId: string,
  genreIds: string[],
): Promise<void> {
  if (!genreIds.length) return;
  await prisma.mediaGenre.createMany({
    data: genreIds.map((genreId) => ({ mediaItemId, genreId })),
    skipDuplicates: true,
  });
}
