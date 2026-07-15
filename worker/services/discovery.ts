// Scheduled discovery/refresh tasks, run from the Worker's `scheduled` handler
// (see worker/index.ts) on the cron in wrangler.jsonc. All keyless/open-source.

import { getPrisma } from "../db";
import { importAndPersistSeasons } from "../routes/media";

/**
 * Re-check the episode guide for existing TV shows so newly-aired seasons and
 * episodes get picked up. Capped per run (Worker subrequest limits) and rotated
 * least-recently-touched first — each processed show is bumped so subsequent
 * runs move through the whole catalog.
 */
export async function refreshTvSeasons(env: Env, limit = 8): Promise<number> {
  const prisma = getPrisma(env);
  const shows = await prisma.mediaItem.findMany({
    where: { type: "TV_SHOW" },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: {
      id: true,
      title: true,
      externalIds: { select: { source: true, value: true } },
    },
  });

  let updated = 0;
  for (const s of shows) {
    try {
      const r = await importAndPersistSeasons(prisma, env, {
        id: s.id,
        title: s.title,
        externalIds: s.externalIds,
      });
      if (r.seasons > 0) updated += 1;
    } catch (err) {
      console.error("season refresh failed for", s.id, err);
    }
    // Touch the row so it rotates to the back of the queue next run.
    await prisma.mediaItem
      .update({ where: { id: s.id }, data: { title: s.title } })
      .catch(() => undefined);
  }
  return updated;
}

/**
 * TODO — discover brand-new / newly-released / trending titles and bulk-import
 * them. This needs a "what's new" source; the free ones we use (Wikidata,
 * Open Library, TVmaze) don't expose trending/new-release feeds, so options are:
 *   - a curated seed list (drop titles into `bulkImport` via the batch endpoint),
 *   - TVmaze's `/schedule` endpoint for new TV episodes airing today, or
 *   - enabling TMDB (trending/now-playing) if a key is ever added.
 * Left as a stub so the cron wiring is in place; implement when a source is chosen.
 */
export async function discoverNewReleases(_env: Env): Promise<number> {
  return 0;
}

/** Orchestrates the daily scheduled run. Extend as discovery tasks land. */
export async function runScheduledDiscovery(env: Env): Promise<void> {
  const refreshed = await refreshTvSeasons(env).catch((err) => {
    console.error("refreshTvSeasons failed:", err);
    return 0;
  });
  console.log(`[cron] refreshed seasons for ${refreshed} show(s)`);
  // await discoverNewReleases(env); // enable once a source is wired
}
