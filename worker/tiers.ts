import { createMiddleware } from "hono/factory";
import {
  type FeatureFlag,
  type TierId,
  tierHasFeature,
} from "../shared/tiers";
import type { AppEnv } from "./types";

// Ordering for "at least this tier" checks. Keep in sync with shared/tiers.ts.
const RANK: Record<TierId, number> = { FREE: 0, STANDARD: 1 };

/** Require the user to be on at least `min` tier, else 402. */
export const requireTier = (min: TierId) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const tier = c.get("profile").tier as TierId;
    if ((RANK[tier] ?? 0) < RANK[min]) {
      return c.json({ error: "upgrade_required", requiredTier: min }, 402);
    }
    await next();
  });

/** Require a specific feature flag (per shared/tiers.ts), else 402. */
export const requireFeature = (feature: FeatureFlag) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const tier = c.get("profile").tier as TierId;
    if (!tierHasFeature(tier, feature)) {
      return c.json({ error: "upgrade_required", feature }, 402);
    }
    await next();
  });
