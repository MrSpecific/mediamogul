// Scheduled discovery/refresh tasks, run from the Worker's `scheduled` handler
// (see worker/index.ts) on the cron in wrangler.jsonc. All keyless/open-source.
// Runtime behavior is governed by the CronConfig singleton (admin Control Center).

import { getPrisma } from "../db";
import { importAndPersistSeasons } from "../routes/media";
import type { PrismaClient } from "../generated/prisma/client";

/** Fetch (creating with defaults if missing) the singleton CronConfig row. */
export async function getCronConfig(prisma: PrismaClient) {
  return prisma.cronConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}

type CronCfg = Awaited<ReturnType<typeof getCronConfig>>;

/**
 * Re-check the episode guide for TV shows that are due (refresh enabled and not
 * refreshed within `minRefreshHours`), soonest-upcoming-release first. Capped at
 * `refreshBatchSize` per run to stay within Worker subrequest limits.
 * `importAndPersistSeasons` stamps `lastRefreshedAt` (and flips `refreshEnabled`
 * off for ended shows), so runs naturally rotate through the catalog.
 */
export async function refreshTvSeasons(
  prisma: PrismaClient,
  env: Env,
  cfg: CronCfg,
): Promise<number> {
  const cutoff = new Date(Date.now() - cfg.minRefreshHours * 3_600_000);
  const shows = await prisma.mediaItem.findMany({
    where: {
      type: "TV_SHOW",
      refreshEnabled: true,
      OR: [{ lastRefreshedAt: null }, { lastRefreshedAt: { lt: cutoff } }],
    },
    orderBy: [{ nextReleaseDate: "asc" }, { lastRefreshedAt: "asc" }],
    take: cfg.refreshBatchSize,
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
  }
  return updated;
}

/**
 * TODO — discover brand-new / trending titles and bulk-import them. Free sources
 * (Wikidata, Open Library, TVmaze) don't expose trending feeds, so options are a
 * curated seed list, TVmaze `/schedule`, or TMDB (if a key is added). Gated by
 * `cfg.newReleaseDiscovery`; stubbed until a source is wired.
 */
export async function discoverNewReleases(
  _prisma: PrismaClient,
  _env: Env,
): Promise<number> {
  return 0;
}

/** Orchestrates a scheduled run per the CronConfig. Also the "Run now" target. */
export async function runScheduledDiscovery(
  env: Env,
): Promise<{ seasonsRefreshed: number }> {
  const prisma = getPrisma(env);
  const cfg = await getCronConfig(prisma);

  let seasonsRefreshed = 0;
  if (cfg.seasonRefreshEnabled) {
    seasonsRefreshed = await refreshTvSeasons(prisma, env, cfg).catch((err) => {
      console.error("refreshTvSeasons failed:", err);
      return 0;
    });
  }
  // if (cfg.newReleaseDiscovery) await discoverNewReleases(prisma, env);

  await prisma.cronConfig
    .update({ where: { id: "singleton" }, data: { lastRunAt: new Date() } })
    .catch(() => undefined);
  console.log(`[cron] refreshed seasons for ${seasonsRefreshed} show(s)`);
  return { seasonsRefreshed };
}
