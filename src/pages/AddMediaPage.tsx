import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Flex, Heading, Input, Text } from "@wlcr/base-ic";
import { apiSend } from "../lib/api";
import type { MediaCandidate, MediaItem } from "../lib/types";

export function AddMediaPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MediaCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      setResults(
        await apiSend<MediaCandidate[]>(
          "GET",
          `/lookup?source=open_library&q=${encodeURIComponent(q)}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importCandidate(candidate: MediaCandidate) {
    setBusy(true);
    try {
      const item = await apiSend<MediaItem>("POST", "/media/import", {
        candidate,
      });
      navigate(`/media/${item.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Flex direction="column" gap="4">
      <Heading size="7">Add media</Heading>
      <Text color="gray">
        Search Open Library (books) — we pull in the cover, description, and
        external IDs automatically. Movies/TV via TMDB coming soon.
      </Text>

      <Flex
        as="form"
        gap="3"
        wrap="wrap"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          placeholder="Title, author, or ISBN…"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        <Button type="submit" loading={busy}>
          Search
        </Button>
      </Flex>

      {error && <Text color="red">{error}</Text>}

      <Flex direction="column" gap="2">
        {results?.map((c, i) => (
          <Card key={`${c.title}-${i}`} size="2">
            <Flex gap="3" align="center" justify="space-between">
              <Flex gap="3" align="center">
                {c.coverImageUrl && (
                  <img
                    src={c.coverImageUrl}
                    alt=""
                    width={44}
                    height={66}
                    style={{ objectFit: "cover", borderRadius: 4 }}
                  />
                )}
                <Flex direction="column" gap="1">
                  <Text weight="medium">{c.title}</Text>
                  {c.releaseDate && (
                    <Badge size="1" variant="soft">
                      {c.releaseDate.slice(0, 4)}
                    </Badge>
                  )}
                </Flex>
              </Flex>
              <Button
                variant="soft"
                onClick={() => void importCandidate(c)}
                loading={busy}
              >
                Add
              </Button>
            </Flex>
          </Card>
        ))}
        {results && results.length === 0 && (
          <Text color="gray">No matches.</Text>
        )}
      </Flex>
    </Flex>
  );
}
