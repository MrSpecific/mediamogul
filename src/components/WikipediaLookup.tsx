import { useState } from "react";
import { Badge, Button, Card, Flex, Input, Text } from "@wlcr/base-ic";
import { Check, Image as ImageIcon, Search } from "lucide-react";
import { apiGet, apiSend } from "../lib/api";

interface WikipediaCandidate {
  title: string;
  description?: string;
  extract?: string;
  url: string;
}

interface Props {
  mediaId: string;
  title: string;
  /** Wikipedia URL already linked, if any. */
  currentUrl?: string | null;
  onChanged?: () => void;
}

/** Admin: search Wikipedia and link an article, optionally adopting its intro
 *  as the synopsis. Mirrors LibbyLookup; the manual URL editor stays as a
 *  fallback for when search doesn't surface the right page. */
export function WikipediaLookup({
  mediaId,
  title,
  currentUrl,
  onChanged,
}: Props) {
  const [q, setQ] = useState(title);
  const [results, setResults] = useState<WikipediaCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [posterBusy, setPosterBusy] = useState<string | null>(null);
  const [posterMsg, setPosterMsg] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    try {
      setResults(
        await apiGet<WikipediaCandidate[]>(
          `/media/${mediaId}/wikipedia/search?q=${encodeURIComponent(q)}`,
        ),
      );
    } finally {
      setSearching(false);
    }
  };

  const link = async (cand: WikipediaCandidate, withSynopsis: boolean) => {
    setBusy(cand.url);
    try {
      await apiSend("PUT", `/media/${mediaId}/wikipedia`, {
        url: cand.url,
        synopsis: withSynopsis ? cand.extract : undefined,
      });
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  // Adopt the article's lead image as the cover (works with the given url, or
  // the already-linked article when none is passed).
  const pullPoster = async (url?: string) => {
    setPosterBusy(url ?? "current");
    setPosterMsg(null);
    try {
      const r = await apiSend<{ coverImageUrl: string | null }>(
        "POST",
        `/media/${mediaId}/wikipedia/poster`,
        { url },
      );
      setPosterMsg(
        r.coverImageUrl
          ? "Cover image pulled from Wikipedia."
          : "No image found on that Wikipedia page.",
      );
      onChanged?.();
    } catch (e) {
      const messages: Record<string, string> = {
        no_image: "No image found on that Wikipedia page.",
        ingest_failed: "Found an image, but it couldn't be saved as a cover.",
        no_wikipedia_link: "Link a Wikipedia article first.",
        bad_url: "That doesn't look like a Wikipedia article URL.",
      };
      const code = (e as Error).message;
      setPosterMsg(messages[code] ?? code);
    } finally {
      setPosterBusy(null);
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
          wrapperClassName="grow"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          placeholder="Search Wikipedia…"
        />
        <Button type="submit" size="1" loading={searching}>
          <Search size={14} aria-hidden /> Search
        </Button>
      </Flex>

      {currentUrl && (
        <Flex gap="2" align="center" wrap="wrap">
          <Button
            size="1"
            variant="soft"
            loading={posterBusy === "current"}
            onClick={() => void pullPoster()}
          >
            <ImageIcon size={13} aria-hidden /> Use Wikipedia image as cover
          </Button>
        </Flex>
      )}
      {posterMsg && (
        <Text size="1" color="gray">
          {posterMsg}
        </Text>
      )}

      {results?.length === 0 && (
        <Text size="1" color="gray">
          No Wikipedia matches.
        </Text>
      )}

      <Flex direction="column" gap="2">
        {results?.map((r) => {
          const linked = currentUrl === r.url;
          return (
            <Card key={r.url} size="1">
              <Flex direction="column" gap="1">
                <Flex gap="2" align="center" justify="space-between">
                  <Text size="2" weight="medium" truncate>
                    {r.title}
                  </Text>
                  {linked ? (
                    <Flex gap="1" align="center" className="shrink">
                      <Badge size="1" color="green" variant="solid">
                        <Check size={12} aria-hidden /> Linked
                      </Badge>
                      <Button
                        size="1"
                        variant="soft"
                        loading={posterBusy === r.url}
                        onClick={() => void pullPoster(r.url)}
                      >
                        <ImageIcon size={12} aria-hidden /> Image
                      </Button>
                    </Flex>
                  ) : (
                    <Flex gap="1" className="shrink">
                      <Button
                        size="1"
                        variant="soft"
                        loading={busy === r.url}
                        onClick={() => void link(r, false)}
                      >
                        Link
                      </Button>
                      {r.extract && (
                        <Button
                          size="1"
                          loading={busy === r.url}
                          onClick={() => void link(r, true)}
                        >
                          Link + synopsis
                        </Button>
                      )}
                      <Button
                        size="1"
                        variant="soft"
                        loading={posterBusy === r.url}
                        onClick={() => void pullPoster(r.url)}
                        title="Set this article's image as the cover"
                      >
                        <ImageIcon size={12} aria-hidden /> Image
                      </Button>
                    </Flex>
                  )}
                </Flex>
                {r.description && (
                  <Text size="1" color="gray">
                    {r.description}
                  </Text>
                )}
              </Flex>
            </Card>
          );
        })}
      </Flex>
    </Flex>
  );
}
