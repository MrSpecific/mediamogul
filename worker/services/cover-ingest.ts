// Downloading remote cover art into our own storage (R2). Scraped covers used
// to be hot-linked; sources rot (Open Library now redirects covers to
// archive.org, which 503s under load), so every cover we learn about gets
// ingested and served from /uploads/. Also home of the "true-up" pass that
// migrates historic remote-linked covers.

import { uploadImage } from "./storage";
import type { PrismaClient } from "../generated/prisma/client";

/**
 * Percent-encode URL characters that are technically illegal in a URL (spaces,
 * braces, backticks, pipes, …) without touching existing `%` escapes. OverDrive
 * cover URLs contain raw `{...}` which makes the Workers `fetch()` throw on an
 * invalid URL — so callers must sanitize before fetching.
 */
export function sanitizeUrl(u: string): string {
  return u.replace(
    /[{}|\\^`<>\s]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

/** Mark one cover asset primary (demoting the rest) and sync the item's cover. */
export async function makeCoverPrimary(
  prisma: PrismaClient,
  mediaItemId: string,
  assetId: string,
  url: string,
) {
  await prisma.mediaAsset.updateMany({
    where: { mediaItemId, kind: "COVER", isPrimary: true },
    data: { isPrimary: false },
  });
  await prisma.mediaAsset.update({
    where: { id: assetId },
    data: { isPrimary: true },
  });
  await prisma.mediaItem.update({
    where: { id: mediaItemId },
    data: { coverImageUrl: url },
  });
}

export interface RemoteCoverOpts {
  imageUrl: string;
  sourceName?: string;
  sourceUrl?: string;
  license?: string;
  creator?: string;
}

/** Fetch a remote image and validate it, without writing anything. */
async function fetchRemoteImage(
  imageUrl: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const res = await fetch(sanitizeUrl(imageUrl), {
    headers: { "User-Agent": "mediamogul/1.0 (media consumption tracker)" },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const contentType = res.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) return null;
  const bytes = await res.arrayBuffer();
  return { bytes, contentType };
}

/**
 * Fetch a remote image, store it in R2, record a provenance asset, and set it
 * as the item's cover. Returns the stored URL, or null if the fetch failed —
 * never throws, so a bad cover can't fail the surrounding import.
 */
export async function ingestRemoteCover(
  prisma: PrismaClient,
  env: Env,
  mediaItemId: string,
  opts: RemoteCoverOpts,
  userId: string | null,
): Promise<string | null> {
  try {
    const img = await fetchRemoteImage(opts.imageUrl);
    if (!img) return null;
    const stored = await uploadImage(env, img.bytes, img.contentType);
    const asset = await prisma.mediaAsset.create({
      data: {
        mediaItemId,
        kind: "COVER",
        provider: stored.provider,
        key: stored.key,
        url: stored.url,
        contentType: stored.contentType,
        size: stored.size,
        sourceName: opts.sourceName,
        sourceUrl: opts.sourceUrl,
        license: opts.license,
        creator: opts.creator,
        uploadedById: userId,
      },
    });
    await makeCoverPrimary(prisma, mediaItemId, asset.id, stored.url);
    return stored.url;
  } catch (err) {
    console.error("cover ingest failed:", err);
    return null;
  }
}

// --- true-up: migrate historic remote-linked covers into R2 -----------------

export interface TrueUpResult {
  id: string;
  title: string;
  from: string;
  status: "stored" | "fetchable" | "failed";
  url?: string;
}

/**
 * Open Library serves covers from per-size zip archives on archive.org; when
 * the -L (large) archive 503s, the -M (medium) one often still works. Offer it
 * as a fallback candidate.
 */
function coverUrlCandidates(url: string): string[] {
  const m = url.match(
    /^(https:\/\/covers\.openlibrary\.org\/b\/(?:id|isbn)\/[^/]+)-L\.jpg$/,
  );
  return m ? [url, `${m[1]}-M.jpg`] : [url];
}

/**
 * One page of the cover true-up: find items whose cover is still a remote URL,
 * ingest each into R2, and clean up the placeholder "external" asset rows the
 * cover manager may have backfilled for them. Items whose remote cover can't
 * be fetched right now keep their URL (the true-up can simply run again).
 *
 * `dryRun` fetches + validates but writes nothing — safe from local dev, where
 * R2 is simulated but the database is real.
 */
export async function trueUpCovers(
  prisma: PrismaClient,
  env: Env,
  opts: { limit: number; cursor?: string; dryRun?: boolean },
): Promise<{ results: TrueUpResult[]; nextCursor: string | null }> {
  const items = await prisma.mediaItem.findMany({
    where: {
      coverImageUrl: { startsWith: "http" },
      ...(opts.cursor ? { id: { gt: opts.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: opts.limit,
    select: { id: true, title: true, coverImageUrl: true },
  });

  const results: TrueUpResult[] = [];
  for (const item of items) {
    const from = item.coverImageUrl!;
    let status: TrueUpResult["status"] = "failed";
    let url: string | undefined;
    for (const candidate of coverUrlCandidates(from)) {
      if (opts.dryRun) {
        if (await fetchRemoteImage(candidate)) status = "fetchable";
      } else {
        const stored = await ingestRemoteCover(
          prisma,
          env,
          item.id,
          { imageUrl: candidate, sourceName: "Cover true-up", sourceUrl: from },
          env.BATCH_USER_ID ?? null,
        );
        if (stored) {
          status = "stored";
          url = stored;
          // Drop the remote-URL placeholder asset (backfilled by the cover
          // manager) so it doesn't linger as a broken alternative.
          await prisma.mediaAsset.deleteMany({
            where: { mediaItemId: item.id, provider: "external", url: from },
          });
        }
      }
      if (status !== "failed") break;
    }
    results.push({ id: item.id, title: item.title, from, status, url });
  }

  return {
    results,
    nextCursor: items.length === opts.limit ? items[items.length - 1].id : null,
  };
}
