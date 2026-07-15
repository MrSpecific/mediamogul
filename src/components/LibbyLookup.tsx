import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Flex, Input, Text } from "@wlcr/base-ic";
import { Check, Search } from "lucide-react";
import { apiGet, apiSend } from "../lib/api";
import type { MediaType } from "../lib/types";

interface LibbyCandidate {
  id: string;
  title: string;
  subtitle?: string;
  creator?: string;
  coverUrl?: string;
  format?: string;
  seriesName?: string;
  seriesPosition?: number;
  url: string;
  /** Our media type this format maps to (null if unsupported). */
  mediaType?: MediaType | null;
  /** Set if this Libby title is already in our catalog. */
  existingId?: string | null;
}

interface Props {
  mediaId: string;
  title: string;
  /** The current item's media type — used to spot alternate formats. */
  currentType: MediaType;
  /** The Libby id already linked, if any. */
  currentLibbyId?: string;
  onChanged?: () => void;
}

const FORMAT_LABEL: Record<string, string> = {
  BOOK: "book",
  AUDIOBOOK: "audiobook",
  MAGAZINE: "magazine",
};

/** Extract an OverDrive title id from a pasted Libby share URL, or accept a
 *  raw id. Returns null if nothing usable. */
function parseLibbyId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/title\/([0-9]+)/);
  if (m) return m[1];
  return /^[0-9]+$/.test(s) ? s : null;
}

/** Admin: search Libby/OverDrive and link a title id (optionally its cover),
 *  or import an alternate format (e.g. the audiobook of a book) as its own
 *  linked catalog entry. A manual id/URL fallback covers search misses. */
export function LibbyLookup({
  mediaId,
  title,
  currentType,
  currentLibbyId,
  onChanged,
}: Props) {
  const [q, setQ] = useState(title);
  const [results, setResults] = useState<LibbyCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [manualErr, setManualErr] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    try {
      setResults(
        await apiGet<LibbyCandidate[]>(
          `/media/${mediaId}/libby/search?q=${encodeURIComponent(q)}`,
        ),
      );
    } finally {
      setSearching(false);
    }
  };

  const link = async (cand: LibbyCandidate, withCover: boolean) => {
    setBusy(cand.id);
    try {
      await apiSend("POST", `/media/${mediaId}/libby`, {
        libbyId: cand.id,
        coverUrl: withCover ? cand.coverUrl : undefined,
        seriesName: cand.seriesName,
        seriesPosition: cand.seriesPosition,
      });
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const importAlternate = async (cand: LibbyCandidate) => {
    setBusy(cand.id);
    try {
      await apiSend("POST", `/media/${mediaId}/libby/import-alternate`, {
        libbyId: cand.id,
        title: cand.title,
        subtitle: cand.subtitle,
        creator: cand.creator,
        coverUrl: cand.coverUrl,
        format: cand.format,
        seriesName: cand.seriesName,
        seriesPosition: cand.seriesPosition,
      });
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const linkManual = async () => {
    const parsed = parseLibbyId(manual);
    if (!parsed) {
      setManualErr("Enter a Libby share link or numeric title id.");
      return;
    }
    setManualErr(null);
    setBusy("manual");
    try {
      await apiSend("POST", `/media/${mediaId}/libby`, { libbyId: parsed });
      setManual("");
      onChanged?.();
    } finally {
      setBusy(null);
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
          placeholder="Search Libby…"
        />
        <Button type="submit" size="1" loading={searching}>
          <Search size={14} aria-hidden /> Search
        </Button>
      </Flex>

      {results?.length === 0 && (
        <Text size="1" color="gray">
          No Libby matches.
        </Text>
      )}

      <Flex direction="column" gap="2">
        {results?.map((r) => {
          const linked = currentLibbyId === r.id;
          // A different format than the current item is offered as an import
          // (creating a linked alternate-format entry) rather than a link.
          const isAlternate = Boolean(
            r.mediaType && r.mediaType !== currentType,
          );
          const altLabel =
            (r.mediaType && FORMAT_LABEL[r.mediaType]) || "alternate";
          return (
            <Card key={r.id} size="1">
              <Flex gap="2" align="center" justify="space-between">
                <Flex gap="2" align="center" className="shrink">
                  {r.coverUrl && (
                    <img
                      src={r.coverUrl}
                      alt=""
                      width={32}
                      height={48}
                      style={{ objectFit: "cover", borderRadius: 3 }}
                    />
                  )}
                  <Flex direction="column" className="shrink">
                    <Text size="2" weight="medium" truncate>
                      {r.title}
                    </Text>
                    <Text size="1" color="gray">
                      {[
                        r.creator,
                        r.format,
                        r.seriesName &&
                          `${r.seriesName}${r.seriesPosition ? ` #${r.seriesPosition}` : ""}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Flex>
                </Flex>
                {linked ? (
                  <Badge size="1" color="green" variant="soft">
                    <Check size={12} aria-hidden /> Linked
                  </Badge>
                ) : isAlternate ? (
                  r.existingId ? (
                    <Link to={`/media/${r.existingId}`}>
                      <Badge size="1" variant="soft">
                        In catalog →
                      </Badge>
                    </Link>
                  ) : (
                    <Button
                      size="1"
                      color="green"
                      loading={busy === r.id}
                      onClick={() => void importAlternate(r)}
                    >
                      Import {altLabel}
                    </Button>
                  )
                ) : (
                  <Flex gap="1">
                    <Button
                      size="1"
                      variant="soft"
                      loading={busy === r.id}
                      onClick={() => void link(r, false)}
                    >
                      Link
                    </Button>
                    {r.coverUrl && (
                      <Button
                        size="1"
                        loading={busy === r.id}
                        onClick={() => void link(r, true)}
                      >
                        Link + cover
                      </Button>
                    )}
                  </Flex>
                )}
              </Flex>
            </Card>
          );
        })}
      </Flex>

      <details className="manual-fallback">
        <summary>
          <Text size="1" color="gray">
            Or paste a Libby link / id manually
          </Text>
        </summary>
        <Flex
          as="form"
          gap="2"
          align="center"
          onSubmit={(e) => {
            e.preventDefault();
            void linkManual();
          }}
          style={{ marginTop: 8 }}
        >
          <Input
            wrapperClassName="grow"
            value={manual}
            onChange={(e) => setManual(e.currentTarget.value)}
            placeholder="share.libbyapp.com/title/1234567 or 1234567"
          />
          <Button
            type="submit"
            size="1"
            variant="soft"
            loading={busy === "manual"}
          >
            Link
          </Button>
        </Flex>
        {manualErr && (
          <Text size="1" color="red">
            {manualErr}
          </Text>
        )}
      </details>
    </Flex>
  );
}
