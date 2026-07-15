import { useApiData } from "./hooks";
import {
  type FeatureFlag,
  type TierId,
  tierHasFeature,
} from "../../shared/tiers";
import type { Profile } from "./types";

/** The current user's profile (tier, admin flag, …). Cached per component. */
export function useMe() {
  return useApiData<Profile>("/me");
}

/** Whether the given profile's tier unlocks a feature (false while loading). */
export function hasFeature(
  profile: Profile | null | undefined,
  flag: FeatureFlag,
): boolean {
  if (!profile?.tier) return false;
  return tierHasFeature(profile.tier as TierId, flag);
}
