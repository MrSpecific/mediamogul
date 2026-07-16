import { useState } from "react";
import { Flex, Select, Text } from "@wlcr/base-ic";
import { apiSend, ApiError } from "../lib/api";
import { useApiData } from "../lib/hooks";
import { ContentRatingBadge } from "./ContentRatingBadge";
import type { ContentRating, ContentRatingRef, MediaType } from "../lib/types";

interface Props {
  mediaId: string;
  mediaType: MediaType;
  current: ContentRatingRef | null;
  onChanged: () => void;
}

/** Admin: set/clear a media item's content rating directly (PATCH /media/:id). */
export function ContentRatingEditor({
  mediaId,
  mediaType,
  current,
  onChanged,
}: Props) {
  const { data: options } = useApiData<ContentRating[]>(
    `/content-ratings?type=${mediaType}`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing applies to this media type (e.g. books) and none is set → hide.
  if (options && options.length === 0 && !current) return null;

  const save = async (contentRatingId: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await apiSend("PATCH", `/media/${mediaId}`, { contentRatingId });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        Content rating
      </Text>
      <Flex gap="2" align="center" wrap="wrap">
        <Select
          value={current?.id ?? ""}
          onValueChange={(v) => void save((v as string) || null)}
          size="1"
          disabled={busy}
        >
          <Select.Item value="">Not rated</Select.Item>
          {(options ?? []).map((r) => (
            <Select.Item key={r.id} value={r.id}>
              {r.code} — {r.name}
            </Select.Item>
          ))}
        </Select>
        {current && <ContentRatingBadge rating={current} size="1" />}
      </Flex>
      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}
    </Flex>
  );
}
