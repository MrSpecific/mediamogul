import { useCallback, useEffect, useSyncExternalStore } from "react";
import { apiGet } from "./api";

/**
 * A tiny stale-while-revalidate cache for GET resources, keyed by API path.
 *
 * Values live in memory AND are mirrored to `localStorage`, which persists
 * across launches in both a PWA and a Capacitor webview and — crucially — reads
 * *synchronously*, so a cached resource paints instantly on the next open. The
 * cache is never authoritative: reads kick off a background refresh, so stale
 * data self-corrects within a tick.
 *
 * Persistence is deliberately behind two small functions so it can later be
 * swapped for IndexedDB or @capacitor/preferences without touching call sites.
 * (localStorage is chosen precisely because its synchronous read enables the
 * instant first paint; an async store would reintroduce a loading flash.)
 */

const PREFIX = "mm:cache:";

function persistRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function persistWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota / serialization / privacy-mode errors are non-fatal — the cache is
    // best-effort and always backed by the network.
  }
}

interface Entry {
  /** Last known value; null until first hydrate or fetch. */
  data: unknown;
  hydrated: boolean;
  inflight: Promise<void> | null;
  listeners: Set<() => void>;
}

const store = new Map<string, Entry>();

function entryFor(key: string): Entry {
  let e = store.get(key);
  if (!e) {
    e = { data: null, hydrated: false, inflight: null, listeners: new Set() };
    store.set(key, e);
  }
  if (!e.hydrated) {
    e.data = persistRead(key);
    e.hydrated = true;
  }
  return e;
}

function notify(e: Entry): void {
  for (const cb of e.listeners) cb();
}

/** Current cached value (from memory, hydrated from storage on first read). */
export function readResource<T>(key: string): T | null {
  return entryFor(key).data as T | null;
}

export function subscribeResource(key: string, cb: () => void): () => void {
  const e = entryFor(key);
  e.listeners.add(cb);
  return () => {
    e.listeners.delete(cb);
  };
}

/** Directly set a resource (e.g. an optimistic update right after a mutation). */
export function mutateResource<T>(key: string, data: T): void {
  const e = entryFor(key);
  e.data = data;
  persistWrite(key, data);
  notify(e);
}

/**
 * Fetch `key` (an API path) in the background and update the cache. Concurrent
 * calls share one request, so opening the dialog and the page at the same time
 * fetches once. Cached data is kept on failure; the next revalidate retries.
 */
export function revalidateResource<T>(key: string): Promise<void> {
  const e = entryFor(key);
  if (e.inflight) return e.inflight;
  const p = apiGet<T>(key)
    .then((data) => {
      e.data = data;
      persistWrite(key, data);
      notify(e);
    })
    .catch(() => {
      // Keep the stale value; revalidation is best-effort.
    })
    .finally(() => {
      e.inflight = null;
    });
  e.inflight = p;
  return p;
}

/**
 * Read a cached GET resource by API path with stale-while-revalidate:
 *   - returns cached data immediately (instant paint), or null on a cold start;
 *   - refreshes in the background on mount, on path change, and whenever the
 *     app/tab returns to the foreground — a "convenient time" that covers both a
 *     PWA regaining focus and Capacitor resuming from background.
 * Pass `null` to disable (e.g. gate on a dialog being open).
 */
export function useCachedResource<T>(path: string | null): {
  data: T | null;
  loading: boolean;
  revalidate: () => Promise<void>;
} {
  const data = useSyncExternalStore(
    (cb) => (path ? subscribeResource(path, cb) : () => {}),
    () => (path ? readResource<T>(path) : null),
    () => null,
  );

  const revalidate = useCallback(
    () => (path ? revalidateResource<T>(path) : Promise.resolve()),
    [path],
  );

  useEffect(() => {
    if (!path) return;
    void revalidateResource<T>(path);
    const onForeground = () => {
      if (document.visibilityState === "visible") {
        void revalidateResource<T>(path);
      }
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [path]);

  return { data, loading: data === null, revalidate };
}
