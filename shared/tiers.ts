// Single source of truth for subscription pricing and feature gating.
// Shared by the Worker (enforcement) and the frontend (display).
// Edit this file to change plans, prices, or which features each tier unlocks.

/** Matches the Prisma `SubscriptionTier` enum. */
export type TierId = "FREE" | "STANDARD";

/** Feature flags gated by tier. Add flags here as product decisions land. */
export type FeatureFlag =
  "unlimitedLists" | "privateReviews" | "advancedStats" | "bulkImport";

export const FEATURE_LABELS: Record<FeatureFlag, string> = {
  unlimitedLists: "Unlimited lists",
  privateReviews: "Private reviews",
  advancedStats: "Advanced stats",
  bulkImport: "Bulk metadata import",
};

export interface Tier {
  id: TierId;
  name: string;
  /** Monthly price in USD cents. 0 = free. */
  priceCents: number;
  description: string;
  /** Which features this tier unlocks. */
  features: Record<FeatureFlag, boolean>;
  /** Non-boolean limits (null = unlimited). Tune as needed. */
  limits: {
    lists: number | null;
  };
}

export const TIERS: Record<TierId, Tier> = {
  FREE: {
    id: "FREE",
    name: "Free",
    priceCents: 0,
    description: "Track your media, rate and review, and build a few lists.",
    features: {
      unlimitedLists: false,
      privateReviews: true,
      advancedStats: false,
      bulkImport: false,
    },
    limits: { lists: 5 },
  },
  STANDARD: {
    id: "STANDARD",
    name: "Standard",
    priceCents: 199, // $1.99/mo — pinned for now, tweak here anytime.
    description:
      "Keep the project alive! Everything in Free, plus power-user features.",
    features: {
      unlimitedLists: true,
      privateReviews: true,
      advancedStats: true,
      bulkImport: true,
    },
    limits: { lists: null },
  },
};

export const DEFAULT_TIER: TierId = "FREE";

/** "$1.99/mo" or "Free". */
export function formatPrice(cents: number): string {
  return cents === 0 ? "$0.00" : `$${(cents / 100).toFixed(2)}/mo`;
}

/** Whether a tier unlocks a feature. Use for gating on client and server. */
export function tierHasFeature(tier: TierId, feature: FeatureFlag): boolean {
  return TIERS[tier]?.features[feature] ?? false;
}

/** A tier's limit for a given resource (null = unlimited). */
export function tierLimit(
  tier: TierId,
  key: keyof Tier["limits"],
): number | null {
  return TIERS[tier]?.limits[key] ?? null;
}
