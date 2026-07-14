import { useState } from "react";
import { Button, Field, Flex, Input, Text } from "@wlcr/base-ic";
import { apiSend } from "../lib/api";

export function WikipediaLinkEditor({
  mediaId,
  currentUrl,
  onChanged,
}: {
  mediaId: string;
  currentUrl?: string | null;
  onChanged: () => void;
}) {
  const [url, setUrl] = useState(currentUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiSend("PUT", `/media/${mediaId}/wikipedia`, {
        url: url.trim() || null,
      });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flex direction="column" gap="2">
      <Field label="Wikipedia URL">
        <Input
          type="url"
          value={url}
          placeholder="https://en.wikipedia.org/wiki/…"
          onChange={(e) => setUrl(e.currentTarget.value)}
        />
      </Field>
      {error && <Text color="red" size="2">{error}</Text>}
      <Flex>
        <Button size="2" variant="soft" loading={saving} onClick={() => void save()}>
          {url.trim() ? "Save Wikipedia link" : "Remove Wikipedia link"}
        </Button>
      </Flex>
    </Flex>
  );
}
