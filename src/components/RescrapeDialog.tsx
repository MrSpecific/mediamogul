import { useEffect, useState } from "react";
import { Badge, Button, Dialog, Flex, Separator, Text } from "@wlcr/base-ic";
import { apiSend } from "../lib/api";
import type { MediaCandidate } from "../lib/types";

interface Current {
  title: string;
  shortDescription: string | null;
  synopsis: string | null;
  coverImageUrl: string | null;
  releaseDate: string | null;
  originalLanguage: string | null;
  publisher: string | null;
  pageCount: number | null;
  runtimeMinutes: number | null;
  seasons: number | null;
  episodes: number | null;
  credits: { role: string; name: string }[];
  genres: string[];
}

interface RescrapeResponse {
  candidate: MediaCandidate | null;
  current: Current;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string;
  onChanged?: () => void;
}

// Scalar fields we can diff + apply, in display order.
const SCALAR_FIELDS: {
  key: keyof Current & keyof MediaCandidate;
  label: string;
}[] = [
  { key: "title", label: "Title" },
  { key: "shortDescription", label: "Short description" },
  { key: "synopsis", label: "Synopsis" },
  { key: "releaseDate", label: "Release date" },
  { key: "publisher", label: "Publisher" },
  { key: "pageCount", label: "Pages" },
  { key: "runtimeMinutes", label: "Runtime (min)" },
  { key: "seasons", label: "Seasons" },
  { key: "episodes", label: "Episodes" },
];

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return String(v);
};

/** Admin: re-scrape a source and selectively apply the fresh values. */
export function RescrapeDialog({
  open,
  onOpenChange,
  mediaId,
  onChanged,
}: Props) {
  const [data, setData] = useState<RescrapeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  // Which proposed changes are checked (field key / "credits" / "genre" / "cover").
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  /* Fetch-on-open: reset + load whenever the dialog opens. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setData(null);
    setError(null);
    setPicked({});
    setLoading(true);
    apiSend<RescrapeResponse>("POST", `/media/${mediaId}/rescrape`)
      .then((r) => {
        setData(r);
        // Default-check fields that are currently empty but proposed non-empty.
        const next: Record<string, boolean> = {};
        if (r.candidate) {
          for (const f of SCALAR_FIELDS) {
            const cur = r.current[f.key];
            const prop = r.candidate[f.key];
            const empty = cur === null || cur === undefined || cur === "";
            if (empty && prop != null && prop !== "") next[f.key] = true;
          }
        }
        setPicked(next);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, mediaId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const candidate = data?.candidate;
  const current = data?.current;

  // Rows where the proposed value actually differs from the current one.
  const diffRows = SCALAR_FIELDS.filter((f) => {
    if (!candidate || !current) return false;
    const prop = candidate[f.key];
    if (prop == null || prop === "") return false;
    return show(prop) !== show(current[f.key]);
  });

  const proposedGenre = candidate?.genre?.trim();
  const genreIsNew =
    proposedGenre &&
    !current?.genres.some(
      (g) => g.toLowerCase() === proposedGenre.toLowerCase(),
    );
  const proposedCredits = candidate?.credits ?? [];
  const creditsDiffer =
    proposedCredits.length > 0 &&
    JSON.stringify(proposedCredits.map((c) => `${c.role}:${c.name}`).sort()) !==
      JSON.stringify(
        (current?.credits ?? []).map((c) => `${c.role}:${c.name}`).sort(),
      );
  const coverDiffers =
    candidate?.coverImageUrl &&
    candidate.coverImageUrl !== current?.coverImageUrl;

  const hasAnyChange =
    diffRows.length > 0 ||
    Boolean(genreIsNew) ||
    creditsDiffer ||
    Boolean(coverDiffers);
  const anyPicked = Object.values(picked).some(Boolean);

  const toggle = (key: string) =>
    setPicked((p) => ({ ...p, [key]: !p[key] }));

  const apply = async () => {
    if (!candidate) return;
    setApplying(true);
    setError(null);
    const patch: Record<string, unknown> = {};
    for (const f of diffRows) {
      if (picked[f.key]) patch[f.key] = candidate[f.key];
    }
    const payload: Record<string, unknown> = {};
    if (Object.keys(patch).length) payload.patch = patch;
    if (picked.credits && creditsDiffer) {
      payload.replaceCredits = proposedCredits.map((c) => ({
        role: c.role,
        name: c.name,
      }));
    }
    if (picked.genre && proposedGenre) payload.addGenres = [proposedGenre];
    if (picked.cover && coverDiffers) {
      payload.cover = { imageUrl: candidate.coverImageUrl };
    }
    try {
      await apiSend("POST", `/media/${mediaId}/apply`, payload);
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="large"
      title="Re-scrape data"
      description="Fetch fresh data from the source and choose what to apply."
      content={
        <Flex direction="column" gap="3">
          {loading && <Text color="gray">Searching the source…</Text>}
          {error && (
            <Text color="red" size="2">
              {error}
            </Text>
          )}
          {!loading && data && !candidate && (
            <Text color="gray">
              No matching source record found for this item.
            </Text>
          )}
          {!loading && candidate && !hasAnyChange && (
            <Text color="gray">
              The source has nothing new — everything already matches.
            </Text>
          )}

          {candidate && current && hasAnyChange && (
            <Flex direction="column" gap="3">
              {diffRows.map((f) => (
                <label key={f.key} className="diff-row">
                  <input
                    type="checkbox"
                    checked={!!picked[f.key]}
                    onChange={() => toggle(f.key)}
                  />
                  <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
                    <Text size="1" color="gray">
                      {f.label}
                    </Text>
                    <Text size="2" className="diff-old">
                      {show(current[f.key])}
                    </Text>
                    <Text size="2" weight="medium">
                      → {show(candidate[f.key])}
                    </Text>
                  </Flex>
                </label>
              ))}

              {coverDiffers && (
                <>
                  <Separator size="4" />
                  <label className="diff-row">
                    <input
                      type="checkbox"
                      checked={!!picked.cover}
                      onChange={() => toggle("cover")}
                    />
                    <Flex gap="3" align="center">
                      <img
                        src={candidate.coverImageUrl}
                        alt=""
                        width={44}
                        height={66}
                        style={{ objectFit: "cover", borderRadius: 4 }}
                      />
                      <Text size="2" weight="medium">
                        Update cover image
                      </Text>
                    </Flex>
                  </label>
                </>
              )}

              {creditsDiffer && (
                <label className="diff-row">
                  <input
                    type="checkbox"
                    checked={!!picked.credits}
                    onChange={() => toggle("credits")}
                  />
                  <Flex direction="column" gap="1">
                    <Text size="2" weight="medium">
                      Replace credits
                    </Text>
                    <Flex gap="1" wrap="wrap">
                      {proposedCredits.map((cr) => (
                        <Badge
                          key={`${cr.role}:${cr.name}`}
                          size="1"
                          variant="soft"
                          color="gray"
                        >
                          {cr.name}
                        </Badge>
                      ))}
                    </Flex>
                  </Flex>
                </label>
              )}

              {genreIsNew && (
                <label className="diff-row">
                  <input
                    type="checkbox"
                    checked={!!picked.genre}
                    onChange={() => toggle("genre")}
                  />
                  <Text size="2" weight="medium">
                    Add genre: {proposedGenre}
                  </Text>
                </label>
              )}
            </Flex>
          )}
        </Flex>
      }
      footer={
        <Flex gap="2" justify="end">
          <Button variant="soft" color="gray" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void apply()}
            loading={applying}
            disabled={!anyPicked}
          >
            Apply selected
          </Button>
        </Flex>
      }
    >
      <span style={{ display: "none" }} aria-hidden />
    </Dialog>
  );
}
