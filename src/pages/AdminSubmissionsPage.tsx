import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Flex,
  Heading,
  Text,
  Textarea,
} from "@wlcr/base-ic";
import { Sparkles } from "lucide-react";
import { apiGet, apiSend } from "../lib/api";
import { useApiData } from "../lib/hooks";
import type { MediaCandidate } from "../lib/types";

interface Submission {
  id: string;
  kind: string;
  status: string;
  proposedData: Record<string, unknown> | null;
  message: string | null;
  createdAt: string;
  submitter: { username: string; displayName: string | null };
  targetMediaItem: { id: string; title: string; type: string } | null;
  duplicateMediaItem: { id: string; title: string; type: string } | null;
}

const KIND_LABELS: Record<string, string> = {
  MEDIA_EDIT: "Media edit",
  NEW_MEDIA: "New media",
  DUPLICATE: "Duplicate",
  INCORRECT_INFO: "Incorrect information",
  ABUSE: "Abuse",
  OTHER: "Other",
};

/** Fields we can fold from a scraped candidate into a submission proposal.
 *  Kept in sync with the backend's `editableMedia` schema — anything not here
 *  (cover art, credits, external ids…) would be rejected on review. */
const SCRAPE_FIELDS: { key: keyof MediaCandidate; label: string }[] = [
  { key: "subtitle", label: "Subtitle" },
  { key: "shortDescription", label: "Short description" },
  { key: "synopsis", label: "Synopsis" },
  { key: "releaseDate", label: "Release date" },
  { key: "publisher", label: "Publisher" },
  { key: "pageCount", label: "Pages" },
  { key: "runtimeMinutes", label: "Runtime (min)" },
  { key: "seasons", label: "Seasons" },
  { key: "episodes", label: "Episodes" },
  { key: "wikipediaUrl", label: "Wikipedia URL" },
];

/** The usable value of a candidate field, normalized for the proposal. */
function fieldValue(
  cand: MediaCandidate,
  key: keyof MediaCandidate,
): string | number | undefined {
  const v = cand[key];
  if (v == null || v === "") return undefined;
  // editableMedia expects a YYYY-MM-DD date, but candidates may carry a full ISO.
  if (key === "releaseDate") return String(v).slice(0, 10);
  if (typeof v === "string" || typeof v === "number") return v;
  return undefined;
}

function preview(v: string | number): string {
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

function candidateYear(cand: MediaCandidate): string | null {
  if (!cand.releaseDate) return null;
  const y = new Date(cand.releaseDate).getFullYear();
  return Number.isNaN(y) ? null : String(y);
}

function SubmissionCard({
  item,
  onReviewed,
}: {
  item: Submission;
  onReviewed: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scraping, setScraping] = useState(false);
  const [candidates, setCandidates] = useState<MediaCandidate[] | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [included, setIncluded] = useState<Record<string, boolean>>({});

  const canScrape = item.kind === "NEW_MEDIA" || item.kind === "MEDIA_EDIT";
  const proposal = item.proposedData ?? {};

  const scrape = async () => {
    setScraping(true);
    setScrapeError(null);
    setPicked(null);
    try {
      const r = await apiGet<{ items: MediaCandidate[] }>(
        `/submissions/${item.id}/scrape`,
      );
      setCandidates(r.items);
      if (r.items.length === 0) setScrapeError("No matches found.");
    } catch (e) {
      setScrapeError((e as Error).message);
    } finally {
      setScraping(false);
    }
  };

  const pick = (idx: number) => {
    setPicked(idx);
    const cand = candidates![idx];
    // Default to including fields the submitter didn't already provide, so the
    // common "fill in the blanks" case is one click.
    const defaults: Record<string, boolean> = {};
    for (const f of SCRAPE_FIELDS) {
      const already = proposal[f.key] != null && proposal[f.key] !== "";
      defaults[f.key] = fieldValue(cand, f.key) !== undefined && !already;
    }
    setIncluded(defaults);
  };

  const selected = useMemo(() => {
    if (picked == null || !candidates) return {} as Record<string, unknown>;
    const cand = candidates[picked];
    const out: Record<string, unknown> = {};
    for (const f of SCRAPE_FIELDS) {
      const val = fieldValue(cand, f.key);
      if (included[f.key] && val !== undefined) out[f.key] = val;
    }
    return out;
  }, [picked, candidates, included]);

  const mergeCount = Object.keys(selected).length;
  const merged =
    mergeCount > 0 ? { ...proposal, ...selected } : undefined;

  const review = async (decision: "APPROVE" | "REJECT") => {
    setBusy(true);
    setError(null);
    try {
      await apiSend("POST", `/submissions/${item.id}/review`, {
        decision,
        adminNote: note.trim() || undefined,
        proposedData: decision === "APPROVE" ? merged : undefined,
      });
      onReviewed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card size="3">
      <Flex direction="column" gap="3">
        <Flex justify="space-between" gap="2" wrap="wrap">
          <Flex gap="2" align="center" wrap="wrap">
            <Badge color={item.kind === "ABUSE" ? "red" : "gray"}>
              {KIND_LABELS[item.kind] ?? item.kind}
            </Badge>
            <Text size="2">
              from{" "}
              <Link to={`/u/${item.submitter.username}`}>
                @{item.submitter.username}
              </Link>
            </Text>
          </Flex>
          <Text size="1" color="gray">
            {new Date(item.createdAt).toLocaleString()}
          </Text>
        </Flex>

        {item.targetMediaItem && (
          <Text size="2">
            Target:{" "}
            <Link to={`/media/${item.targetMediaItem.id}`}>
              {item.targetMediaItem.title}
            </Link>
          </Text>
        )}
        {item.duplicateMediaItem && (
          <Text size="2">
            Possible duplicate:{" "}
            <Link to={`/media/${item.duplicateMediaItem.id}`}>
              {item.duplicateMediaItem.title}
            </Link>
          </Text>
        )}
        {item.proposedData && (
          <pre className="submission-json">
            {JSON.stringify(item.proposedData, null, 2)}
          </pre>
        )}
        {item.message && (
          <Text className="media-description-content">{item.message}</Text>
        )}

        {canScrape && (
          <Flex direction="column" gap="2">
            <Flex gap="2" align="center" wrap="wrap">
              <Button
                variant="soft"
                loading={scraping}
                onClick={() => void scrape()}
              >
                <Sparkles size={16} aria-hidden /> Scrape additional info
              </Button>
              {scrapeError && (
                <Text size="1" color="gray">
                  {scrapeError}
                </Text>
              )}
            </Flex>

            {candidates && candidates.length > 0 && (
              <Flex direction="column" gap="2">
                <Text size="1" color="gray">
                  Pick the matching source, then choose which fields to include.
                </Text>
                <Flex gap="2" wrap="wrap">
                  {candidates.map((cand, idx) => {
                    const year = candidateYear(cand);
                    return (
                      <Button
                        key={`${cand.title}-${idx}`}
                        size="1"
                        variant={picked === idx ? "solid" : "soft"}
                        color={picked === idx ? undefined : "gray"}
                        onClick={() => pick(idx)}
                      >
                        {cand.title}
                        {year ? ` (${year})` : ""}
                      </Button>
                    );
                  })}
                </Flex>

                {picked != null && (
                  <Card size="2" variant="surface">
                    <Flex direction="column" gap="2">
                      {SCRAPE_FIELDS.map((f) => {
                        const val = fieldValue(candidates[picked], f.key);
                        if (val === undefined) return null;
                        const already =
                          proposal[f.key] != null && proposal[f.key] !== "";
                        return (
                          <label key={f.key} className="scrape-field">
                            <Checkbox
                              size="1"
                              checked={!!included[f.key]}
                              onCheckedChange={(v) =>
                                setIncluded((s) => ({ ...s, [f.key]: !!v }))
                              }
                            />
                            <span className="scrape-field-text">
                              <Text size="1" weight="medium">
                                {f.label}
                                {already && (
                                  <Text size="1" color="amber">
                                    {" "}
                                    · replaces submitted value
                                  </Text>
                                )}
                              </Text>
                              <Text size="1" color="gray">
                                {preview(val)}
                              </Text>
                            </span>
                          </label>
                        );
                      })}
                    </Flex>
                  </Card>
                )}
              </Flex>
            )}
          </Flex>
        )}

        <Textarea
          rows={2}
          placeholder="Optional note for the audit trail"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        {error && (
          <Text size="1" color="red">
            {error}
          </Text>
        )}
        <Flex justify="space-between" align="center" gap="2" wrap="wrap">
          <Text size="1" color="gray">
            {mergeCount > 0
              ? `Approving will include ${mergeCount} scraped field${mergeCount === 1 ? "" : "s"}.`
              : ""}
          </Text>
          <Flex gap="2">
            <Button
              variant="soft"
              color="red"
              loading={busy}
              onClick={() => void review("REJECT")}
            >
              Reject
            </Button>
            <Button
              color="green"
              loading={busy}
              onClick={() => void review("APPROVE")}
            >
              Approve
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Card>
  );
}

export function AdminSubmissionsPage() {
  const navigate = useNavigate();
  const { data, reload } = useApiData<Submission[]>(
    "/submissions?status=PENDING",
  );

  return (
    <Flex direction="column" gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading size="7">Content submissions</Heading>
        <Button variant="soft" onClick={() => navigate("/admin/genres")}>
          Manage genres
        </Button>
      </Flex>
      <Text color="gray">
        Review suggested edits, new catalog entries, duplicate reports, and
        other feedback.
      </Text>
      {data?.length === 0 && (
        <Card>
          <Text color="gray">No pending submissions.</Text>
        </Card>
      )}
      {data?.map((item) => (
        <SubmissionCard key={item.id} item={item} onReviewed={reload} />
      ))}
    </Flex>
  );
}
