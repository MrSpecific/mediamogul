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
import { Check, ExternalLink, Layers, Plus, Search } from "lucide-react";
import { apiSend } from "../lib/api";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { SegmentedControl } from "../components/SegmentedControl";
import { ManualMediaForm } from "../components/ManualMediaForm";
import { MEDIA_FIELDS } from "../../shared/media-fields";
import type { MediaCandidate, MediaItem, MediaType } from "../lib/types";

type Mode = "search" | "manual";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "search", label: "Search" },
  { value: "manual", label: "Enter manually" },
];

// Types the unified search can actually return (others are manual-only).
const SEARCHABLE_TYPES: MediaType[] = ["MOVIE", "TV_SHOW", "BOOK"];

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

  const [q, setQ] = useState(initialQ);
  // Empty = include all searchable types; toggling narrows to those picked.
  const [types, setTypes] = useState<MediaType[]>([]);
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

  async function fetchPage(
    query: string,
    pg: number,
  ): Promise<MediaCandidate[]> {
    return apiSend<MediaCandidate[]>(
      "GET",
      `/lookup?source=all&q=${encodeURIComponent(query)}&page=${pg}`,
    );
  }

  async function search(query: string) {
    if (!query.trim()) return;
    // Keep the query in the URL so the search survives navigating away and back.
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("q", query);
      return p;
    });
    setSearching(true);
    setError(null);
    setPage(1);
    try {
      const rs = await fetchPage(query, 1);
      setResults(rs);
      setHasMore(rs.length > 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function loadMore() {
    const next = page + 1;
    setLoadingMore(true);
    try {
      const rs = await fetchPage(q, next);
      setResults((prev) => [...(prev ?? []), ...rs]);
      setHasMore(rs.length > 0);
      setPage(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  // Auto-run the search when arriving with a pre-filled query (e.g. from the
  // catalog's "add missing media" prompt).
  const ranInitial = useRef(false);
  useEffect(() => {
    if (initialQ && !ranInitial.current) {
      ranInitial.current = true;
      void search(initialQ);
    }
    // `search` is stable enough for a one-shot; guarded by ranInitial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  async function importCandidate(candidate: MediaCandidate, key: string) {
    setAddingKey(key);
    try {
      const item = await apiSend<MediaItem>("POST", "/media/import", {
        candidate,
      });
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
      <Heading size="7">Add media</Heading>

      <SegmentedControl
        ariaLabel="Add mode"
        value={mode}
        onChange={setMode}
        options={MODE_OPTIONS}
      />

      {mode === "manual" ? (
        <ManualMediaForm />
      ) : (
        <>
          <Text color="gray">
            Search across books, movies, and TV at once — we pull in the cover,
            description, and external IDs automatically. Toggle off any type you
            don't want in the results.
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
              onChange={(e) => setQ(e.currentTarget.value)}
              // autofocus={true}
            />
            <Button type="submit" loading={searching}>
              <Search size={16} aria-hidden /> Search
            </Button>
          </Flex>

          <ToggleGroup
            multiple
            value={types}
            onValueChange={(v: unknown[]) => setTypes(v as MediaType[])}
          >
            {SEARCHABLE_TYPES.map((t) => (
              <Toggle key={t} value={t}>
                {MEDIA_FIELDS[t].label}
              </Toggle>
            ))}
          </ToggleGroup>

          {error && <Text color="red">{error}</Text>}
          {seriesMsg && (
            <Text color="green" size="2">
              {seriesMsg}
            </Text>
          )}

          <Flex direction="column" gap="2">
            {visible?.map((c, i) => {
              const author = byline(c);
              const key = `${c.title}-${i}`;
              return (
                <Card key={key} size="2">
                  <Flex gap="3" align="center" justify="space-between">
                    <Flex gap="3" align="center" className="shrink">
                      {c.coverImageUrl && (
                        <img
                          src={c.coverImageUrl}
                          alt=""
                          width={44}
                          height={66}
                          style={{ objectFit: "cover", borderRadius: 4 }}
                        />
                      )}
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
                              In your catalog
                            </Badge>
                          )}
                        </Flex>
                        <Text weight="medium" truncate>
                          {c.title}
                        </Text>
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
            {results && results.length > 0 && hasMore && (
              <Flex justify="center">
                <Button
                  variant="soft"
                  loading={loadingMore}
                  onClick={() => void loadMore()}
                >
                  Show more
                </Button>
              </Flex>
            )}
          </Flex>
        </>
      )}
    </Flex>
  );
}
