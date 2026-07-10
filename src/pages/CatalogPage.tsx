import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Flex,
  Heading,
  Input,
  Text,
  Toggle,
  ToggleGroup,
} from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { MediaCard } from "../components/MediaCard";
import { MEDIA_TYPES, type MediaItem, type MediaType } from "../lib/types";

const ALL_TYPES = MEDIA_TYPES.map((t) => t.value);

export function CatalogPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  // All types selected by default.
  const [types, setTypes] = useState<MediaType[]>(ALL_TYPES);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  // Only constrain when it's an actual subset; all-selected => no filter.
  if (types.length < ALL_TYPES.length) params.set("types", types.join(","));

  const { data, loading } = useApiData<{
    items: MediaItem[];
    nextCursor: string | null;
  }>(`/media?${params.toString()}`);

  const allSelected = types.length === ALL_TYPES.length;

  return (
    <Flex direction="column" gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading size="7">Catalog</Heading>
        <Button onClick={() => navigate("/catalog/add")}>Add media</Button>
      </Flex>

      <Input
        placeholder="Search titles…"
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
      />

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
        <Button
          size="1"
          variant="ghost"
          onClick={() => setTypes(allSelected ? [] : ALL_TYPES)}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
      </Flex>

      {loading && <Text color="gray">Loading…</Text>}
      {data && data.items.length === 0 && (
        <Text color="gray">
          {types.length === 0
            ? "Select a media type to see results."
            : "No results. Try adding something new."}
        </Text>
      )}
      <div className="media-grid">
        {data?.items.map((m) => (
          <MediaCard key={m.id} item={m} />
        ))}
      </div>
    </Flex>
  );
}
