import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, ApiError } from "./api";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (d: T | null) => void;
}

/** Minimal data-fetching hook. Pass `null` to skip fetching. */
export function useApiData<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (path === null) return;
    setLoading(true);
    apiGet<T>(path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

/**
 * Sets the browser-tab title while this component is mounted, restoring the
 * previous title on unmount (or when it changes). Pass `null` — e.g. while the
 * page's data is still loading — to leave the title untouched.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/** Shape every cursor-paginated endpoint returns. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

interface PaginatedState<T> {
  /** All items loaded so far, across every page. */
  items: T[];
  /** True while the first page is loading (i.e. after a filter change). */
  loading: boolean;
  /** True while an additional page is loading via `loadMore`. */
  loadingMore: boolean;
  error: string | null;
  /** Whether the server reported another page after the last one. */
  hasMore: boolean;
  /** Fetch and append the next page. No-op while loading or when exhausted. */
  loadMore: () => void;
  /** Discard loaded pages and re-fetch from the first page. */
  reload: () => void;
  /** True once the first fetch has resolved at least once (stays true across
   *  later filter changes) — lets callers hold an empty state steady instead of
   *  flickering it in and out on each in-flight query. */
  loaded: boolean;
}

/**
 * Cursor-paginated fetch hook. Pass the base request path (with any filter
 * query params, but WITHOUT a cursor); the hook appends `cursor` for each
 * page and accumulates the results. Changing `path` — e.g. when filters
 * change — resets to a fresh first page. Pass `null` to skip fetching.
 *
 * Pairs with the `<LoadMore>` component.
 */
export function usePaginatedApi<T>(path: string | null): PaginatedState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Bumped on every first-page load so responses from a stale filter set
  // (still in flight when the path changed) are discarded on arrival.
  const genRef = useRef(0);

  const withCursor = (base: string, cursor: string) =>
    `${base}${base.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}`;

  // Load (or reload) the first page whenever the base path changes.
  useEffect(() => {
    if (path === null) {
      setItems([]);
      setNextCursor(null);
      setLoading(false);
      return;
    }
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    apiGet<Page<T>>(path)
      .then((d) => {
        if (gen !== genRef.current) return;
        setItems(d.items);
        setNextCursor(d.nextCursor);
      })
      .catch((e: unknown) => {
        if (gen !== genRef.current) return;
        setError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => {
        if (gen === genRef.current) setLoading(false);
        setLoaded(true);
      });
  }, [path, reloadTick]);

  const loadMore = useCallback(() => {
    if (path === null || nextCursor === null || loading || loadingMore) return;
    const gen = genRef.current;
    setLoadingMore(true);
    apiGet<Page<T>>(withCursor(path, nextCursor))
      .then((d) => {
        // A filter change since we started supersedes this page.
        if (gen !== genRef.current) return;
        setItems((prev) => [...prev, ...d.items]);
        setNextCursor(d.nextCursor);
      })
      .catch((e: unknown) => {
        if (gen !== genRef.current) return;
        setError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => {
        if (gen === genRef.current) setLoadingMore(false);
      });
  }, [path, nextCursor, loading, loadingMore]);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore: nextCursor !== null,
    loadMore,
    reload,
    loaded,
  };
}
