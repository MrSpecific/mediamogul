/**
 * Recommendation foundations.
 *
 * Two building blocks the rec endpoints share:
 *   1. `affinityFromSignals` — collapse a user's explicit rating + consumption
 *      status into ONE signed affinity score. This is the substrate every
 *      algorithm consumes; swap the algorithm, keep the signal.
 *   2. Content-based item similarity — represent an item by its features
 *      (genres, creators, cast/crew, series, type) and score overlap. Needs no
 *      other users' data, so it works from day one and survives cold start.
 *
 * Collaborative filtering ("users who liked X also liked Y") is intentionally
 * NOT here yet — it needs rating volume. When that arrives it plugs in as a
 * third score in the blend without disturbing these two.
 */
import type {
  CreditRole,
  EntryStatus,
  MediaType,
} from "../generated/prisma/client";

/**
 * A single (user, item) interaction → affinity in roughly [-1, 1]. An explicit
 * rating wins when present (neutral at 2.5★); otherwise we infer from status.
 */
export function affinityFromSignals(
  stars: number | null,
  status: EntryStatus | null,
): number {
  if (stars != null) return (stars - 2.5) / 2.5; // 5★→1, 2.5★→0, 0.5★→-0.8
  switch (status) {
    case "COMPLETED":
      return 0.5;
    case "IN_PROGRESS":
      return 0.3;
    case "PLANNED":
      return 0.25;
    case "ON_HOLD":
      return 0;
    case "ABANDONED":
      return -0.6;
    default:
      return 0;
  }
}

/** At/above this affinity, an item is a positive "seed" we recommend from. */
export const LIKED_THRESHOLD = 0.4;

// Credits in these roles are the defining authorship of a work — a shared one
// is a much stronger signal than a shared actor/narrator.
const STRONG_ROLES = new Set<CreditRole>([
  "AUTHOR",
  "DIRECTOR",
  "CREATOR",
  "WRITER",
]);

/** The raw relations `featuresOf` needs (a thin projection of MediaItem). */
export interface FeatureInput {
  id: string;
  type: MediaType;
  title: string;
  genres: { genreId: string }[];
  credits: { role: CreditRole; name: string }[];
  seriesEntries: { seriesId: string }[];
}

export interface ItemFeatures {
  id: string;
  type: MediaType;
  title: string;
  genreIds: string[];
  /** Names in the strong authorship roles (author/director/creator/writer). */
  creators: string[];
  /** Every credited name, regardless of role. */
  people: string[];
  seriesIds: string[];
}

export function featuresOf(item: FeatureInput): ItemFeatures {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    genreIds: item.genres.map((g) => g.genreId),
    creators: item.credits
      .filter((c) => STRONG_ROLES.has(c.role))
      .map((c) => c.name),
    people: item.credits.map((c) => c.name),
    seriesIds: item.seriesEntries.map((s) => s.seriesId),
  };
}

function intersect(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return [...new Set(a)].filter((x) => set.has(x));
}

function creatorWord(type: MediaType): string {
  switch (type) {
    case "BOOK":
    case "AUDIOBOOK":
    case "MAGAZINE":
      return "author";
    case "MOVIE":
    case "TV_SHOW":
      return "director";
    default:
      return "creator";
  }
}

export interface SimilarityScore {
  score: number;
  reasons: string[];
}

/**
 * Weighted feature-overlap similarity, strongest signal first. Series identity
 * dominates (it's the same franchise), then shared authorship, then shared
 * cast/crew, then genre overlap; matching type is a small tiebreak.
 */
export function scoreSimilarity(
  seed: ItemFeatures,
  cand: ItemFeatures,
): SimilarityScore {
  let score = 0;
  const reasons: string[] = [];

  const sharedSeries = intersect(seed.seriesIds, cand.seriesIds);
  if (sharedSeries.length) {
    score += 5;
    reasons.push("Same series");
  }

  const sharedCreators = intersect(seed.creators, cand.creators);
  if (sharedCreators.length) {
    score += sharedCreators.length * 3;
    reasons.push(`Same ${creatorWord(seed.type)}: ${sharedCreators[0]}`);
  } else {
    const sharedPeople = intersect(seed.people, cand.people);
    if (sharedPeople.length) {
      score += sharedPeople.length;
      reasons.push(`Shared cast & crew: ${sharedPeople[0]}`);
    }
  }

  const sharedGenres = intersect(seed.genreIds, cand.genreIds);
  if (sharedGenres.length) {
    score += Math.min(sharedGenres.length, 4);
    reasons.push(
      sharedGenres.length === 1
        ? "Shares a genre"
        : `Shares ${sharedGenres.length} genres`,
    );
  }

  if (seed.type === cand.type) score += 0.5;

  return { score, reasons };
}

/** The projection every candidate/seed query should select. */
export const FEATURE_SELECT = {
  id: true,
  type: true,
  title: true,
  genres: { select: { genreId: true } },
  credits: { select: { role: true, name: true } },
  seriesEntries: { select: { seriesId: true } },
} as const;
