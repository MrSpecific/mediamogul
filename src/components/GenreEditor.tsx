import { useState } from "react";
import { Badge, Button, Flex, Select, Text } from "@wlcr/base-ic";
import { Plus, X } from "lucide-react";
import { apiSend, ApiError } from "../lib/api";
import { useApiData } from "../lib/hooks";
import { titleCase } from "../../shared/media-fields";
import type { Genre, MediaType } from "../lib/types";

interface Props {
  mediaId: string;
  mediaType: MediaType;
  genres: { id: string; name: string; slug: string }[];
  onChanged: () => void;
}

/** Admin: add/remove genres on a media item directly (no submission). */
export function GenreEditor({ mediaId, mediaType, genres, onChanged }: Props) {
  const { data: all } = useApiData<Genre[]>(`/genres?type=${mediaType}`);
  const [toAdd, setToAdd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applied = new Set(genres.map((g) => g.id));
  const available = (all ?? []).filter((g) => !applied.has(g.id));

  const add = async () => {
    if (!toAdd) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend("POST", `/media/${mediaId}/genres`, { genreId: toAdd });
      setToAdd(null);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (genreId: string) => {
    setBusyId(genreId);
    setError(null);
    try {
      await apiSend("DELETE", `/media/${mediaId}/genres/${genreId}`);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't remove.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Flex direction="column" gap="2">
      <Flex gap="2" wrap="wrap" align="center">
        {genres.length === 0 && (
          <Text size="1" color="gray">
            No genres yet.
          </Text>
        )}
        {genres.map((g) => (
          <Badge key={g.id} variant="soft" color="gray">
            {titleCase(g.name)}
            <button
              type="button"
              className="badge-remove"
              aria-label={`Remove ${g.name}`}
              disabled={busyId === g.id}
              onClick={() => void remove(g.id)}
            >
              <X size={12} aria-hidden />
            </button>
          </Badge>
        ))}
      </Flex>
      <Flex gap="2" align="center" wrap="wrap">
        <Select
          value={toAdd}
          onValueChange={(v) => setToAdd(v as string)}
          placeholder="Add a genre…"
          size="1"
        >
          {available.map((g) => (
            <Select.Item key={g.id} value={g.id}>
              {titleCase(g.name)}
            </Select.Item>
          ))}
        </Select>
        <Button size="1" loading={busy} disabled={!toAdd} onClick={() => void add()}>
          <Plus size={14} aria-hidden /> Add genre
        </Button>
      </Flex>
      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}
    </Flex>
  );
}
