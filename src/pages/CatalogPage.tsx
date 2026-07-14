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

  // Set/clear a single URL param without disturbing the others.
  const setParam = (key: string, value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
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

  const { items, loading, loadingMore, hasMore, loadMore } =
    usePaginatedApi<MediaItem>(`/media?${reqParams.toString()}`);

  const hasActiveFilter = Boolean(genre || credit);

  return (
    <Flex direction="column" gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading size="7">Catalog</Heading>
        <Button onClick={() => navigate("/catalog/add")}>
          <Plus size={16} aria-hidden /> Add media
        </Button>
      </Flex>

      <Input
        placeholder="Search titles…"
        value={q}
        onChange={(e) => setParam("q", e.currentTarget.value || null)}
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
            {MEDIA_TYPES.map((t) => (
              <Toggle key={t.value} value={t.value}>
                {t.label}
              </Toggle>
            ))}
          </ToggleGroup>
          {types.length > 0 && (
            <Button size="1" variant="ghost" onClick={() => setTypes([])}>
              Clear
            </Button>
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

      {loading && <Text color="gray">Loading…</Text>}
      {!loading && items.length === 0 && (
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
            <Button
              onClick={() =>
                navigate(
                  q
                    ? `/catalog/add?q=${encodeURIComponent(q)}`
                    : "/catalog/add",
                )
              }
            >
              <Plus size={16} aria-hidden />{" "}
              {q ? `Add “${q}”` : "Add media"}
            </Button>
          </Flex>
        </Card>
      )}
      <div className="media-grid">
        {items.map((m) => <MediaCard key={m.id} item={m} />)}
      </div>

      <LoadMore
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
      />
    </Flex>
  );
}
