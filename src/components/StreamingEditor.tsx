import { useState } from "react";
import { Badge, Button, Flex, Grid, Input, Select, Text } from "@wlcr/base-ic";
import { Plus, Trash2 } from "lucide-react";
import { apiSend, ApiError } from "../lib/api";
import { STREAMING_PROVIDERS, type StreamingProvider } from "../lib/streaming";
import type { StreamingAvailability } from "../lib/types";

interface Props {
  mediaId: string;
  streaming: StreamingAvailability[];
  onChanged: () => void;
}

/** Admin: manually curate where a movie/TV show streams (provider + deep link).
 *  Structured to be superseded by automated population later. */
export function StreamingEditor({ mediaId, streaming, onChanged }: Props) {
  const [provider, setProvider] = useState<StreamingProvider>("NETFLIX");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend("POST", `/media/${mediaId}/streaming`, {
        provider,
        url: url.trim(),
      });
      setUrl("");
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await apiSend("DELETE", `/media/${mediaId}/streaming/${id}`);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Flex direction="column" gap="2">
      {streaming.map((s) => (
        <Flex key={s.id} justify="between" align="center" gap="2">
          <Flex gap="2" align="center" className="shrink">
            <Badge variant="soft">{s.provider}</Badge>
            <Text size="1" color="gray" truncate>
              {s.url}
            </Text>
          </Flex>
          <Button
            size="1"
            variant="ghost"
            color="red"
            loading={busyId === s.id}
            onClick={() => void remove(s.id)}
          >
            <Trash2 size={14} aria-hidden />
          </Button>
        </Flex>
      ))}

      <Grid
        as="form"
        gap="2"
        columns="auto 1fr auto"
        align="center"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Select
          value={provider}
          onValueChange={(v) => setProvider(v as StreamingProvider)}
        >
          {STREAMING_PROVIDERS.map((p) => (
            <Select.Item key={p.value} value={p.value}>
              {p.label}
            </Select.Item>
          ))}
        </Select>
        <Input
          wrapperClassName="grow"
          type="url"
          placeholder="https://… deep link to the title"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
        />
        <Button type="submit" size="1" loading={busy} disabled={!url.trim()}>
          <Plus size={14} aria-hidden /> Add
        </Button>
      </Grid>
      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}
    </Flex>
  );
}
