import { useState } from "react";
import { Badge, Button, Card, Flex, Input, Text } from "@wlcr/base-ic";
import { Check, Search } from "lucide-react";
import { apiGet, apiSend } from "../lib/api";

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
}

interface Props {
  mediaId: string;
  title: string;
  /** The Libby id already linked, if any. */
  currentLibbyId?: string;
  onChanged?: () => void;
}

/** Admin: search Libby/OverDrive and link a title id (optionally its cover). */
export function LibbyLookup({
  mediaId,
  title,
  currentLibbyId,
  onChanged,
}: Props) {
  const [q, setQ] = useState(title);
  const [results, setResults] = useState<LibbyCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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
    </Flex>
  );
}
