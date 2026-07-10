import { useState } from "react";
import { Button, Dialog, Flex, Input, Text } from "@wlcr/base-ic";
import { apiGet, apiSend } from "../lib/api";

interface CoverCandidate {
  url: string;
  thumbnail: string;
  title?: string;
  creator?: string;
  license?: string;
  source?: string;
  sourceUrl?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string;
  title: string;
  onChanged?: () => void;
}

/** Search Creative-Commons images (Openverse) and set one as the cover. */
export function CoverFinderDialog({
  open,
  onOpenChange,
  mediaId,
  title,
  onChanged,
}: Props) {
  const [q, setQ] = useState(title);
  const [results, setResults] = useState<CoverCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    try {
      setResults(
        await apiGet<CoverCandidate[]>(
          `/media/${mediaId}/cover-options?q=${encodeURIComponent(q)}`,
        ),
      );
    } finally {
      setSearching(false);
    }
  };

  const pick = async (c: CoverCandidate) => {
    setSavingUrl(c.url);
    try {
      await apiSend("POST", `/media/${mediaId}/cover`, {
        imageUrl: c.url,
        sourceName: c.source,
        sourceUrl: c.sourceUrl,
        license: c.license,
        creator: c.creator,
      });
      onChanged?.();
      onOpenChange(false);
    } catch {
      setSavingUrl(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="large"
      title="Find a cover"
      description="Creative-Commons images from Openverse (Flickr, Wikimedia, museums, and more). Official posters are copyrighted, so pick a CC image that fits."
      content={
        <Flex direction="column" gap="3">
          <Flex
            as="form"
            gap="2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <Input
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              placeholder="Search images…"
            />
            <Button type="submit" size="1" loading={searching}>
              Search
            </Button>
          </Flex>

          {results && results.length === 0 && (
            <Text color="gray">
              No Creative-Commons images found. Try a different search.
            </Text>
          )}

          <div className="cover-grid">
            {results?.map((r) => (
              <button
                key={r.url}
                type="button"
                className="cover-option"
                disabled={savingUrl !== null}
                onClick={() => void pick(r)}
                title={[r.title, r.license, r.creator && `by ${r.creator}`]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <img src={r.thumbnail} alt={r.title ?? ""} loading="lazy" />
                {savingUrl === r.url && (
                  <span className="cover-saving">Saving…</span>
                )}
              </button>
            ))}
          </div>
        </Flex>
      }
    >
      <span style={{ display: "none" }} aria-hidden />
    </Dialog>
  );
}
