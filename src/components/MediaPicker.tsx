import { useState } from "react";
import { Button, Flex, Input, Text } from "@wlcr/base-ic";
import { apiGet } from "../lib/api";
import { MediaTypeBadge } from "./MediaTypeBadge";
import type { MediaItem } from "../lib/types";

interface Props {
  onPick: (media: MediaItem) => void;
  excludeId?: string;
}

/** Search the catalog and pick a media item (used to link relations/series). */
export function MediaPicker({ onPick, excludeId }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const data = await apiGet<{ items: MediaItem[] }>(
        `/media?q=${encodeURIComponent(q)}`,
      );
      setResults(data.items.filter((m) => m.id !== excludeId));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex direction="column" gap="2">
      <Flex
        as="form"
        gap="2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          placeholder="Search catalog…"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        <Button type="submit" size="1" loading={busy}>
          Search
        </Button>
      </Flex>
      {results.map((m) => (
        <Flex key={m.id} justify="space-between" align="center" gap="2">
          <Flex gap="2" align="center">
            <MediaTypeBadge type={m.type} />
            <Text size="2">{m.title}</Text>
          </Flex>
          <Button size="1" variant="soft" onClick={() => onPick(m)}>
            Select
          </Button>
        </Flex>
      ))}
    </Flex>
  );
}
