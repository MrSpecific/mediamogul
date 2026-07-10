import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Flex, Heading, Input, Text } from "@wlcr/base-ic";
import { apiSend } from "../lib/api";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { SegmentedControl } from "../components/SegmentedControl";
import { MEDIA_FIELDS } from "../../shared/media-fields";
import type { MediaCandidate, MediaItem } from "../lib/types";

type Source = "open_library" | "wikidata" | "tmdb";

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: "open_library", label: "Books" },
  { value: "wikidata", label: "Movies & TV" },
  { value: "tmdb", label: "TMDB" },
];

/** Headline credit (author/director/creator) from the type's primary role. */
function byline(c: MediaCandidate): string | undefined {
  const cfg = MEDIA_FIELDS[c.type];
  const role = cfg.primaryCredit;
  if (!role) return undefined;
  const names = (c.credits ?? [])
    .filter((x) => x.role === role)
    .map((x) => x.name)
    .join(", ");
  if (!names) return undefined;
  const prefix = cfg.credits.find((x) => x.role === role)?.byline;
  return prefix ? `${prefix} ${names}` : names;
}

export function AddMediaPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [source, setSource] = useState<Source>("open_library");
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
          `/lookup?source=${source}&q=${encodeURIComponent(q)}`,
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
        Search a public source — we pull in the cover, description, and external
        IDs automatically. Books use Open Library; movies & TV use Wikidata
        (both free to use). TMDB is richer but needs a commercial license.
      </Text>

      <SegmentedControl
        ariaLabel="Search source"
        value={source}
        onChange={setSource}
        options={SOURCE_OPTIONS}
      />

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
          placeholder={
            source === "open_library"
              ? "Title, author, or ISBN…"
              : "Movie or TV title…"
          }
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        <Button type="submit" loading={busy}>
          Search
        </Button>
      </Flex>

      {error && <Text color="red">{error}</Text>}

      <Flex direction="column" gap="2">
        {results?.map((c, i) => {
          const author = byline(c);
          return (
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
                    <Flex gap="2" align="center" wrap="wrap">
                      <MediaTypeBadge type={c.type} />
                      {c.releaseDate && (
                        <Text size="1" color="gray">
                          {c.releaseDate.slice(0, 4)}
                        </Text>
                      )}
                      {c.existingId && (
                        <Badge size="1" variant="soft" color="green">
                          In your catalog
                        </Badge>
                      )}
                    </Flex>
                    <Text weight="medium">{c.title}</Text>
                    {author && (
                      <Text size="2" color="gray">
                        {author}
                      </Text>
                    )}
                  </Flex>
                </Flex>
                {c.existingId ? (
                  <Button
                    variant="soft"
                    onClick={() => navigate(`/media/${c.existingId}`)}
                  >
                    View
                  </Button>
                ) : (
                  <Button
                    variant="soft"
                    onClick={() => void importCandidate(c)}
                    loading={busy}
                  >
                    Add
                  </Button>
                )}
              </Flex>
            </Card>
          );
        })}
        {results && results.length === 0 && (
          <Text color="gray">No matches.</Text>
        )}
      </Flex>
    </Flex>
  );
}
