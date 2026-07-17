import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Flex,
  Heading,
  Input,
  Select,
  Text,
  Toggle,
  ToggleGroup,
} from "@wlcr/base-ic";
import { ArrowDownWideNarrow, Plus, SearchX } from "lucide-react";
import { useApiData, usePaginatedApi } from "../lib/hooks";
import { MediaCard } from "../components/MediaCard";
import { LoadMore } from "../components/LoadMore";
import { Spinner } from "../components/Spinner";
import { titleCase } from "../../shared/media-fields";
import {
  MEDIA_TYPES,
  type Genre,
  type MediaItem,
  type MediaType,
} from "../lib/types";

const ALL_TYPES = MEDIA_TYPES.map((t) => t.value);

// Divisible by every column count the grid uses (6/4/3/2) so each page fills
// complete rows — see `.media-grid` in styles.css.
const PAGE_SIZE = 24;

const ORDER_LABELS: Record<string, string> = {
  new: "Recently added",
  title: "Title (A–Z)",
  release: "Release date",
};

export function CatalogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive all filter state from the URL — the URL is the source of truth.
  const q = searchParams.get("q") ?? "";
  const genre = searchParams.get("genre") ?? "";
  const credit = searchParams.get("credit") ?? "";
  const order = searchParams.get("order") ?? "new";
  const typesParam = searchParams.get("types");
  // No types selected = no type filter (show everything). Selecting types
  // narrows to those.
  const types = typesParam
    ? (typesParam
        .split(",")
        .filter((t) => (ALL_TYPES as string[]).includes(t)) as MediaType[])
    : [];

  // How many pages of results are loaded. Persisted in the URL so returning to
  // the catalog (e.g. browser Back from a media page) restores the same set
  // instead of snapping to the first page.
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);

  // Set/clear a single filter param without disturbing the others. Any filter
  // change resets pagination — the previous page count no longer applies.
  const setParam = (key: string, value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  const setTypes = (next: MediaType[]) =>
    setParam("types", next.length ? next.join(",") : null);

  // Genre list to resolve the active slug → label.
  const { data: genres } = useApiData<Genre[]>("/genres");
  const activeGenre = genres?.find((g) => g.slug === genre);

  // Build the request. No `types` => all types.
  const reqParams = new URLSearchParams();
  reqParams.set("limit", String(PAGE_SIZE));
  if (q) reqParams.set("q", q);
  if (genre) reqParams.set("genre", genre);
  if (credit) reqParams.set("credit", credit);
  if (order && order !== "new") reqParams.set("order", order);
  if (types.length) reqParams.set("types", types.join(","));

  const { items, loading, loadingMore, hasMore, loadMore, loaded } =
    usePaginatedApi<MediaItem>(`/media?${reqParams.toString()}`);

  // Pages currently loaded (each is PAGE_SIZE items; the last may be shorter).
  const pagesLoaded = Math.ceil(items.length / PAGE_SIZE) || 1;

  // Drive loading toward the target page from the URL: on return this replays
  // page fetches until the prior set is restored, and it powers the Load-more
  // button (which just bumps `page`). One fetch at a time — the `loadingMore`
  // guard serializes them.
  useEffect(() => {
    if (!loading && !loadingMore && hasMore && pagesLoaded < page) {
      loadMore();
    }
  }, [loading, loadingMore, hasMore, pagesLoaded, page, loadMore]);

  // Advance a page by recording it in the URL; the effect above does the fetch.
  const showMore = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("page", String(pagesLoaded + 1));
        return next;
      },
      { replace: true },
    );
  };

  const hasActiveFilter = Boolean(genre || credit);

  // Keep the empty state mounted across subsequent no-result searches (only its
  // text updates) instead of unmounting on every keystroke's loading flip —
  // which read as a flash. `loaded` (true once the first fetch resolves) also
  // avoids showing "no results" during the very first load.
  const showEmpty = items.length === 0 && loaded;

  // Hand off to the add-media page: carry the query and the searchable type
  // filters so it pre-fills both and runs the search on arrival.
  const addMediaHref = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const searchable = types.filter(
      (t) => t === "MOVIE" || t === "TV_SHOW" || t === "BOOK",
    );
    if (searchable.length) params.set("types", searchable.join(","));
    const qs = params.toString();
    return qs ? `/catalog/add?${qs}` : "/catalog/add";
  };

  return (
    <Flex direction="column" gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Flex align="center" gap="3">
          <Heading size="7">Catalog</Heading>
          {loading && <Spinner size={18} />}
        </Flex>
        <Button onClick={() => navigate("/catalog/add")}>
          <Plus size={16} aria-hidden /> Add media
        </Button>
      </Flex>

      <Input
        placeholder="Search titles…"
        value={q}
        onChange={(e) => setParam("q", e.currentTarget.value || null)}
        autoFocus
      />

      {hasActiveFilter && (
        <Flex gap="2" align="center" wrap="wrap">
          <Text size="1" color="gray">
            Filtered by
          </Text>
          {activeGenre && (
            <Badge
              variant="soft"
              color="gray"
              style={{ cursor: "pointer" }}
              onClick={() => setParam("genre", null)}
            >
              {titleCase(activeGenre.name)} ✕
            </Badge>
          )}
          {genre && !activeGenre && (
            <Badge
              variant="soft"
              color="gray"
              style={{ cursor: "pointer" }}
              onClick={() => setParam("genre", null)}
            >
              {titleCase(genre.replace(/-/g, " "))} ✕
            </Badge>
          )}
          {credit && (
            <Badge
              variant="soft"
              color="gray"
              style={{ cursor: "pointer" }}
              onClick={() => setParam("credit", null)}
            >
              {credit} ✕
            </Badge>
          )}
        </Flex>
      )}

      <Flex gap="3" align="center" wrap="wrap" justify="space-between">
        <Flex gap="2" align="center" wrap="wrap">
          <ToggleGroup
            multiple
            value={types}
            onValueChange={(v: unknown[]) => setTypes(v as MediaType[])}
          >
            {MEDIA_TYPES.map((t) => {
              const active = types.includes(t.value);
              return (
                <Toggle
                  key={t.value}
                  value={t.value}
                  // Clear on/off contrast: active = solid accent, inactive = muted gray.
                  color={active ? undefined : "gray"}
                  variant={active ? "solid" : "outline"}
                  highContrast={active}
                >
                  {t.label}
                </Toggle>
              );
            })}
          </ToggleGroup>
          {types.length > 0 ? (
            <Button size="1" variant="ghost" onClick={() => setTypes([])}>
              Clear
            </Button>
          ) : (
            <Text size="1" color="gray">
              All types
            </Text>
          )}
        </Flex>
        <Flex gap="2" align="center" className="shrink">
          <ArrowDownWideNarrow size={16} aria-hidden className="dim-icon" />
          <Select
            value={order}
            onValueChange={(v) =>
              setParam("order", v === "new" ? null : (v as string))
            }
          >
            {Object.entries(ORDER_LABELS).map(([value, label]) => (
              <Select.Item key={value} value={value}>
                {label}
              </Select.Item>
            ))}
          </Select>
        </Flex>
      </Flex>

      {/* Stable container (no remount): old results stay in place but dim +
          settle while a new filter loads, then ease back in when results
          arrive. No layout shift, no flash of empty state. */}
      <div
        className="results"
        // Dim/settle only applies to actual results loading — while the empty
        // state is up, keep it fully static across successive no-result queries.
        data-loading={(loading && !showEmpty) || undefined}
      >
        {showEmpty ? (
          <Card size="3" className="empty-state">
            <Flex direction="column" align="center" gap="3">
              <SearchX size={40} aria-hidden className="dim-icon" />
              <Flex direction="column" align="center" gap="1">
                <Text weight="medium" size="4" align="center">
                  {q ? `No results for “${q}”` : "Nothing here yet"}
                </Text>
                <Text color="gray" align="center" style={{ maxWidth: 380 }}>
                  {q
                    ? "It might not be in the catalog yet. Search public sources and add it in a couple of clicks."
                    : "Try adjusting your filters, or add something new to the catalog."}
                </Text>
              </Flex>
              <Button onClick={() => navigate(addMediaHref())}>
                <Plus size={16} aria-hidden /> {q ? `Add “${q}”` : "Add media"}
              </Button>
            </Flex>
          </Card>
        ) : (
          <div className="media-grid">
            {items.map((m) => (
              <MediaCard key={m.id} item={m} />
            ))}
          </div>
        )}
      </div>

      <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={showMore} />

      {!loading && items.length > 0 && !hasMore && (
        <Card size="2" className="catalog-cta">
          <Flex justify="space-between" align="center" gap="3" wrap="wrap">
            <Flex direction="column" gap="1">
              <Text weight="medium">Something missing?</Text>
              <Text size="2" color="gray">
                Add a movie, show, book, or anything else to the catalog.
              </Text>
            </Flex>
            <Button variant="soft" onClick={() => navigate(addMediaHref())}>
              <Plus size={16} aria-hidden /> Add new media
            </Button>
          </Flex>
        </Card>
      )}
    </Flex>
  );
}
