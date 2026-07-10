import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Flex, Heading, Input, Select, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { MediaCard } from "../components/MediaCard";
import { MEDIA_TYPES, type MediaItem, type MediaType } from "../lib/types";

export function CatalogPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [type, setType] = useState<MediaType | "ALL">("ALL");

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type !== "ALL") params.set("type", type);
  const { data, loading } = useApiData<{
    items: MediaItem[];
    nextCursor: string | null;
  }>(`/media?${params.toString()}`);

  return (
    <Flex direction="column" gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading size="7">Catalog</Heading>
        <Button onClick={() => navigate("/catalog/add")}>Add media</Button>
      </Flex>

      <Flex gap="3" wrap="wrap">
        <Input
          placeholder="Search titles…"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        <Select
          value={type}
          onValueChange={(v) => setType(v as MediaType | "ALL")}
          placeholder="All types"
        >
          <Select.Item value="ALL">All types</Select.Item>
          {MEDIA_TYPES.map((t) => (
            <Select.Item key={t.value} value={t.value}>
              {t.label}
            </Select.Item>
          ))}
        </Select>
      </Flex>

      {loading && <Text color="gray">Loading…</Text>}
      {data && data.items.length === 0 && (
        <Text color="gray">No results. Try adding something new.</Text>
      )}
      <div className="media-grid">
        {data?.items.map((m) => (
          <MediaCard key={m.id} item={m} />
        ))}
      </div>
    </Flex>
  );
}
