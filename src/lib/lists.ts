import { revalidateResource, useCachedResource } from "./cache";
import type { ListSummary } from "./types";

/** Shape of GET /me/lists. */
export interface MyLists {
  owned: ListSummary[];
  saved: ListSummary[];
  shared: ListSummary[];
}

export const MY_LISTS_PATH = "/me/lists";

/**
 * The current user's lists, cached with stale-while-revalidate so the Lists page
 * and the Add-to-list dialog paint instantly and refresh in the background.
 * Pass `enabled: false` (e.g. a closed dialog) to skip.
 */
export function useMyLists(enabled = true) {
  return useCachedResource<MyLists>(enabled ? MY_LISTS_PATH : null);
}

/** Refresh the cached lists in the background — call after any mutation that
 *  changes a list's contents, metadata, or membership. */
export function revalidateMyLists(): Promise<void> {
  return revalidateResource<MyLists>(MY_LISTS_PATH);
}
