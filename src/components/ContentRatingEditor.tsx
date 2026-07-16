import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Flex, Select, Text } from "@wlcr/base-ic";
import { Sparkles } from "lucide-react";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { useApiData } from "../lib/hooks";
import { ContentRatingBadge } from "./ContentRatingBadge";
import type { ContentRating, ContentRatingRef, MediaType } from "../lib/types";

interface Props {
  mediaId: string;
  mediaType: MediaType;
  current: ContentRatingRef | null;
  onChanged: () => void;
}

interface ScrapeResult {
  source: string | null;
  code: string | null;
  contentRatingId: string | null;
}

/** Admin: set/clear a media item's content rating directly (PATCH /media/:id),
 *  or scrape it from the best screen source. */
export function ContentRatingEditor({
  mediaId,
  mediaType,
  current,
  onChanged,
}: Props) {
  const { data: options } = useApiData<ContentRating[]>(
    `/content-ratings?type=${mediaType}`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);

  const canScrape = mediaType === "MOVIE" || mediaType === "TV_SHOW";
  const noneApply = options !== null && options.length === 0;

  // For types no rating system covers (e.g. books), hide once we know the
  // catalog is empty and nothing is set. Films/TV always show the control so an
  // admin can set, scrape, or discover that the catalog needs seeding.
  if (!canScrape && noneApply && !current) return null;

  const save = async (contentRatingId: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await apiSend("PATCH", `/media/${mediaId}`, { contentRatingId });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const scrape = async () => {
    setScraping(true);
    setScrapeMsg(null);
    setError(null);
    try {
      const r = await apiGet<ScrapeResult>(`/media/${mediaId}/scrape-rating`);
      if (r.contentRatingId) {
        await save(r.contentRatingId);
        setScrapeMsg(`Set to ${r.code}${r.source ? ` from ${r.source}` : ""}.`);
      } else if (r.code) {
        setScrapeMsg(
          `Found "${r.code}"${r.source ? ` on ${r.source}` : ""}, but it isn't in the ratings catalog.`,
        );
      } else {
        setScrapeMsg("No rating found from the available sources.");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Scrape failed.");
    } finally {
      setScraping(false);
    }
  };

  return (
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        Content rating
      </Text>
      <Flex gap="2" align="center" wrap="wrap">
        <Select
          value={current?.id ?? ""}
          onValueChange={(v) => void save((v as string) || null)}
          size="1"
          disabled={busy}
        >
          <Select.Item value="">Not rated</Select.Item>
          {(options ?? []).map((r) => (
            <Select.Item key={r.id} value={r.id}>
              {r.code} — {r.name}
            </Select.Item>
          ))}
        </Select>
        {current && <ContentRatingBadge rating={current} size="1" />}
        {canScrape && (
          <Button
            size="1"
            variant="soft"
            loading={scraping}
            onClick={() => void scrape()}
          >
            <Sparkles size={13} aria-hidden /> Scrape
          </Button>
        )}
      </Flex>
      {noneApply && (
        <Text size="1" color="gray">
          No ratings defined yet — add them under{" "}
          <Link to="/admin/content-ratings" className="byline-link">
            Content ratings
          </Link>{" "}
          (or run the seed).
        </Text>
      )}
      {scrapeMsg && (
        <Text size="1" color="gray">
          {scrapeMsg}
        </Text>
      )}
      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}
    </Flex>
  );
}
