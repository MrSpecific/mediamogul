import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Flex,
  Heading,
  Input,
  Text,
  Toggle,
  ToggleGroup,
} from "@wlcr/base-ic";
import { Check, ExternalLink, Info, Layers, Plus, Search } from "lucide-react";
import { api, apiSend } from "../lib/api";
import { trackEvent } from "../lib/analytics";
import { LoadMore } from "../components/LoadMore";
import { Spinner } from "../components/Spinner";
import { Cover } from "../components/Cover";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { SegmentedControl } from "../components/SegmentedControl";
import { ManualMediaForm } from "../components/ManualMediaForm";
import { MediaInfoDialog } from "../components/MediaInfoDialog";
import { UpgradeCTA } from "../components/UpgradeCTA";
import { useMe, hasFeature } from "../lib/features";
import { NewMediaSuggestionDialog } from "../components/NewMediaSuggestionDialog";
import { MEDIA_FIELDS } from "../../shared/media-fields";
import type { MediaCandidate, MediaItem, MediaType } from "../lib/types";

type Mode = "search" | "manual";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "search", label: "Search" },
  { value: "manual", label: "Enter manually" },
];

// Types the unified search can actually return (others are manual-only).
const SEARCHABLE_TYPES: MediaType[] = ["MOVIE", "TV_SHOW", "BOOK"];

/** Pick the narrowest lookup source that still covers the selected types, so
 *  narrowing to one kind returns more of it instead of an interleaved mix.
 *  Books → Open Library, movies/TV → Wikidata, mixed/none → all sources. */
function sourceForTypes(
  types: MediaType[],
): "all" | "open_library" | "wikidata" {
  if (types.length === 0) return "all";
  const hasBook = types.includes("BOOK");
  const hasScreen = types.some((t) => t === "MOVIE" || t === "TV_SHOW");
  if (hasBook && !hasScreen) return "open_library";
  if (hasScreen && !hasBook) return "wikidata";
  return "all";
}

/** Headline credit (author/director/creator) from the type's primary role. */
function byline(
  c: MediaCandidate,
): { prefix?: string; names: string[] } | undefined {
  const cfg = MEDIA_FIELDS[c.type];
  const role = cfg.primaryCredit;
  if (!role) return undefined;
  const names = (c.credits ?? [])
    .filter((x) => x.role === role)
    .map((x) => x.name);
  if (!names.length) return undefined;
  return { prefix: cfg.credits.find((x) => x.role === role)?.byline, names };
}

export function AddMediaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  // Type filters carried over from the catalog (e.g. its "Add …" CTA), narrowed
  // to the ones this page's search can actually return.
  const initialTypes = (searchParams.get("types") ?? "")
    .split(",")
    .filter((t): t is MediaType => (SEARCHABLE_TYPES as string[]).includes(t));

  const [q, setQ] = useState(initialQ);
  // Empty = include all searchable types; toggling narrows to those picked.
  const [types, setTypes] = useState<MediaType[]>(initialTypes);
  const [results, setResults] = useState<MediaCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  // Keys already imported this session → the new media id (kept so users can
  // add several items from one search without being navigated away).
  const [addedKeys, setAddedKeys] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("search");
  // Candidate whose info dialog is open (with the result's key for add state).
  const [infoFor, setInfoFor] = useState<{
    c: MediaCandidate;
    key: string;
  } | null>(null);
  const { data: me } = useMe();
  const canManual = hasFeature(me, "manualEntry") || Boolean(me?.isAdmin);
  const lookupControllerRef = useRef<AbortController | null>(null);

  async function fetchPage(
    query: string,
    pg: number,
    signal: AbortSignal,
    source: string,
  ): Promise<{ items: MediaCandidate[]; hasMore: boolean }> {
    return api<{ items: MediaCandidate[]; hasMore: boolean }>(
      `/lookup?source=${source}&q=${encodeURIComponent(query)}&page=${pg}`,
      { signal },
    );
  }

  // `searchTypes` defaults to the current selection, but callers that change
  // the types (the toggles) pass the new set so we don't read stale state.
  async function search(query: string, searchTypes: MediaType[] = types) {
    if (!query.trim()) return;
    lookupControllerRef.current?.abort();
    const controller = new AbortController();
    lookupControllerRef.current = controller;
    // Keep the query in the URL so the search survives navigating away and back.
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("q", query);
      return p;
    });
    setSearching(true);
    setLoadingMore(false);
    setError(null);
    setPage(1);
    try {
      const result = await fetchPage(
        query,
        1,
        controller.signal,
        sourceForTypes(searchTypes),
      );
      setResults(result.items);
      setHasMore(result.hasMore);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
      }
    } finally {
      if (lookupControllerRef.current === controller) {
        lookupControllerRef.current = null;
        setSearching(false);
      }
    }
  }

  async function loadMore() {
    lookupControllerRef.current?.abort();
    const controller = new AbortController();
    lookupControllerRef.current = controller;
    const next = page + 1;
    setLoadingMore(true);
    setSearching(false);
    try {
      const result = await fetchPage(
        q,
        next,
        controller.signal,
        sourceForTypes(types),
      );
      setResults((prev) => [...(prev ?? []), ...result.items]);
      setHasMore(result.hasMore);
      setPage(next);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
      }
    } finally {
      if (lookupControllerRef.current === controller) {
        lookupControllerRef.current = null;
        setLoadingMore(false);
      }
    }
  }

  // Do not leave a lookup running after navigating away from this page.
  useEffect(
    () => () => {
      lookupControllerRef.current?.abort();
    },
    [],
  );

  // Auto-run the search whenever we arrive with a `?q=` — on first mount AND on
  // later in-app navigations that change it (e.g. the catalog's "add missing
  // media" prompt). Tracks the last URL query so it fires once per distinct
  // query and doesn't fight the user typing in the box.
  const lastSearchedQ = useRef<string | null>(null);
  useEffect(() => {
    if (initialQ && initialQ !== lastSearchedQ.current) {
      lastSearchedQ.current = initialQ;
      setQ(initialQ);
      void search(initialQ);
    }
    // `search`/`setQ` are stable; re-run only when the URL query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  async function importCandidate(candidate: MediaCandidate, key: string) {
    setAddingKey(key);
    try {
      const item = await apiSend<MediaItem>("POST", "/media/import", {
        candidate,
      });
      trackEvent("media_added", { method: "catalog", media_type: candidate.type });
      // Stay on the page so the user can keep adding from these results.
      setAddedKeys((prev) => ({ ...prev, [key]: item.id }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingKey(null);
    }
  }

  // Search for everything credited to a person (from a result's byline).
  function searchPerson(name: string) {
    setQ(name);
    void search(name);
  }

  // Import every title in a candidate's series in one go (Wikidata-backed).
  const [seriesBusy, setSeriesBusy] = useState<string | null>(null);
  const [seriesMsg, setSeriesMsg] = useState<string | null>(null);
  async function importSeries(cand: MediaCandidate) {
    if (!cand.seriesId) return;
    setSeriesBusy(cand.seriesId);
    setSeriesMsg(null);
    try {
      const r = await apiSend<{
        total: number;
        created: number;
        existed: number;
      }>("POST", "/media/import-series", {
        source: "wikidata",
        seriesId: cand.seriesId,
      });
      setSeriesMsg(
        `${cand.seriesName}: added ${r.created} title${r.created === 1 ? "" : "s"}` +
          (r.existed ? `, ${r.existed} already in your catalog` : ""),
      );
      if (q) await search(q); // refresh "in catalog" flags
    } catch (e) {
      setSeriesMsg((e as Error).message);
    } finally {
      setSeriesBusy(null);
    }
  }

  const enabled = new Set(types);
  const visible =
    results?.filter((c) => types.length === 0 || enabled.has(c.type)) ?? null;

  return (
    <Flex direction="column" gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Flex align="center" gap="3">
          <Heading size="7">Add media</Heading>
          {searching && <Spinner size={18} />}
        </Flex>
        <NewMediaSuggestionDialog />
      </Flex>

      <SegmentedControl
        ariaLabel="Add mode"
        value={mode}
        onChange={setMode}
        options={MODE_OPTIONS}
      />

      {mode === "manual" ? (
        canManual ? (
          <ManualMediaForm />
        ) : (
          <UpgradeCTA title="Manual entry is a Standard feature">
            Free members add media from search. Upgrade to hand-enter titles
            that aren't in any public source — perfect for rare or personal
            items.
          </UpgradeCTA>
        )
      ) : (
        <>
          <Text color="gray">
            Search across books, movies, and TV at once - we'll pull in the
            information for you.
          </Text>

          <Flex
            as="form"
            gap="3"
            wrap="wrap"
            onSubmit={(e) => {
              e.preventDefault();
              void search(q);
            }}
          >
            <Input
              wrapperClassName="grow"
              placeholder="Title, author, director, or ISBN…"
              value={q}
              onChange={(e) => {
                lookupControllerRef.current?.abort();
                setQ(e.currentTarget.value);
              }}
              onPaste={(e) => {
                e.preventDefault();
                lookupControllerRef.current?.abort();
                const pasted = e.clipboardData.getData("text").trim();
                const input = e.currentTarget;
                const start = input.selectionStart ?? q.length;
                const end = input.selectionEnd ?? q.length;
                setQ(q.slice(0, start) + pasted + q.slice(end));
              }}
              autoFocus={true}
            />
            <Button type="submit" loading={searching}>
              <Search size={16} aria-hidden /> Search
            </Button>
          </Flex>

          <Flex gap="2" align="center" wrap="wrap">
            <ToggleGroup
              multiple
              value={types}
              onValueChange={(v: unknown[]) => {
                const next = v as MediaType[];
                setTypes(next);
                // Re-query (scoped to the new selection) so toggling a type
                // pulls fresh results, not just a client-side filter.
                if (q.trim()) void search(q, next);
              }}
            >
              {SEARCHABLE_TYPES.map((t) => {
                const active = types.includes(t);
                return (
                  <Toggle
                    key={t}
                    value={t}
                    // Clear on/off contrast: active = solid accent, inactive = muted gray.
                    color={active ? undefined : "gray"}
                    variant={active ? "solid" : "outline"}
                    highContrast={active}
                  >
                    {MEDIA_FIELDS[t].label}
                  </Toggle>
                );
              })}
            </ToggleGroup>
            {types.length > 0 ? (
              <Button
                size="1"
                variant="ghost"
                onClick={() => {
                  setTypes([]);
                  if (q.trim()) void search(q, []);
                }}
              >
                Clear
              </Button>
            ) : (
              <Text size="1" color="gray">
                All types
              </Text>
            )}
          </Flex>

          {error && <Text color="red">{error}</Text>}
          {seriesMsg && (
            <Text color="green" size="2">
              {seriesMsg}
            </Text>
          )}

          <Flex
            direction="column"
            gap="2"
            // Dim + settle while searching, then ease results back in. Stable
            // (no remount) so "load more" appends without re-animating.
            className="results"
            data-loading={searching || undefined}
          >
            {visible?.map((c, i) => {
              const author = byline(c);
              const key = `${c.title}-${i}`;
              return (
                <Card key={key} size="2">
                  <Flex gap="3" align="center" justify="space-between">
                    <Flex gap="3" align="center" className="shrink">
                      <Cover
                        type={c.type}
                        title={c.title}
                        src={c.coverImageUrl}
                        hideTitle
                        className="add-result-cover"
                      />
                      <Flex direction="column" gap="1" className="shrink">
                        <Flex gap="2" align="center" wrap="wrap">
                          <MediaTypeBadge type={c.type} />
                          {c.releaseDate && (
                            <Text size="1" color="gray">
                              {c.releaseDate.slice(0, 4)}
                            </Text>
                          )}
                          {c.existingId && (
                            <Badge size="1" variant="soft" color="green">
                              In catalog
                            </Badge>
                          )}
                        </Flex>
                        <button
                          type="button"
                          className="link-button"
                          style={{ textAlign: "left" }}
                          onClick={() => setInfoFor({ c, key })}
                        >
                          <Text weight="medium" truncate>
                            {c.title}
                          </Text>
                        </button>
                        {c.subtitle && (
                          <Text size="1" color="gray" truncate>
                            {c.subtitle}
                          </Text>
                        )}
                        {author && (
                          <Text size="2" color="gray">
                            {author.prefix ? `${author.prefix} ` : ""}
                            {author.names.map((name, n) => (
                              <span key={name}>
                                {n > 0 && ", "}
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() => searchPerson(name)}
                                >
                                  {name}
                                </button>
                              </span>
                            ))}
                          </Text>
                        )}
                        {c.seriesId && c.seriesName && (
                          <Button
                            size="1"
                            variant="ghost"
                            loading={seriesBusy === c.seriesId}
                            onClick={() => void importSeries(c)}
                            style={{ alignSelf: "start" }}
                          >
                            <Layers size={13} aria-hidden /> Add all in{" "}
                            {c.seriesName}
                          </Button>
                        )}
                      </Flex>
                    </Flex>
                    <Flex gap="2" align="center" className="shrink">
                      <Button
                        variant="soft"
                        color="gray"
                        aria-label="Details"
                        onClick={() => setInfoFor({ c, key })}
                      >
                        <Info size={16} aria-hidden />
                      </Button>
                      {(() => {
                        const targetId = c.existingId ?? addedKeys[key];
                        if (targetId) {
                          return (
                            <Flex gap="2" align="center" className="shrink">
                              {addedKeys[key] && !c.existingId && (
                                <Badge size="1" variant="soft" color="green">
                                  <Check size={12} aria-hidden /> Added
                                </Badge>
                              )}
                              <Button
                                variant="soft"
                                color="gray"
                                onClick={() => navigate(`/media/${targetId}`)}
                              >
                                <ExternalLink size={16} aria-hidden /> View
                              </Button>
                            </Flex>
                          );
                        }
                        return (
                          <Button
                            color="green"
                            onClick={() => void importCandidate(c, key)}
                            loading={addingKey === key}
                            disabled={addingKey === key}
                          >
                            <Plus size={16} aria-hidden /> Add
                          </Button>
                        );
                      })()}
                    </Flex>
                  </Flex>
                </Card>
              );
            })}
            {visible && visible.length === 0 && (
              <Text color="gray">
                {results && results.length > 0
                  ? "No matches for the selected types."
                  : "No matches."}
              </Text>
            )}
            <LoadMore
              hasMore={Boolean(results && results.length > 0 && hasMore)}
              loading={loadingMore}
              onLoadMore={() => void loadMore()}
            />
          </Flex>
        </>
      )}

      <MediaInfoDialog
        candidate={infoFor?.c ?? null}
        onOpenChange={(o) => {
          if (!o) setInfoFor(null);
        }}
        onAdd={() => {
          if (infoFor) void importCandidate(infoFor.c, infoFor.key);
        }}
        adding={infoFor ? addingKey === infoFor.key : false}
        existingId={
          infoFor
            ? (infoFor.c.existingId ?? addedKeys[infoFor.key] ?? null)
            : null
        }
        onView={(mid) => {
          setInfoFor(null);
          navigate(`/media/${mid}`);
        }}
      />
    </Flex>
  );
}
