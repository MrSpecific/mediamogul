import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  Button,
  Card,
  Flex,
  Heading,
  Select,
  Separator,
  Text,
  Textarea,
} from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { StarRating } from "../components/StarRating";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { MEDIA_FIELDS, formatFieldValue } from "../../shared/media-fields";
import type {
  ListSummary,
  MediaDetail,
  Review,
  Visibility,
} from "../lib/types";

/** Headline credit line (e.g. "Directed by …"), from the type's primary role. */
function bylineOf(data: MediaDetail): string | undefined {
  const cfg = MEDIA_FIELDS[data.type];
  const role = cfg.primaryCredit;
  if (!role) return undefined;
  const names = (data.credits ?? [])
    .filter((c) => c.role === role)
    .map((c) => c.name)
    .join(", ");
  if (!names) return undefined;
  const prefix = cfg.credits.find((c) => c.role === role)?.byline;
  return prefix ? `${prefix} ${names}` : names;
}

/** Type-specific facts (runtime, pages, seasons…), config-driven. */
function factsOf(data: MediaDetail): { label: string; value: string }[] {
  return MEDIA_FIELDS[data.type].fields
    .map((spec) => ({
      label: spec.label,
      value: formatFieldValue(spec, data[spec.key]),
    }))
    .filter((f): f is { label: string; value: string } => f.value !== undefined);
}

export function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = useApiData<MediaDetail>(id ? `/media/${id}` : null);
  const { data: reviews, reload: reloadReviews } = useApiData<Review[]>(
    id ? `/media/${id}/reviews` : null,
  );
  const { data: myLists } = useApiData<{ owned: ListSummary[] }>("/me/lists");

  const [reviewBody, setReviewBody] = useState("");
  const [reviewVis, setReviewVis] = useState<Visibility>("PUBLIC");
  const [msg, setMsg] = useState<string | null>(null);

  if (!data) return <Text color="gray">Loading…</Text>;

  const yourStars = data.you.rating ? Number(data.you.rating.stars) : null;

  const rate = async (stars: number) => {
    await apiSend("PUT", `/media/${id}/rating`, { stars });
    reload();
  };
  const log = async () => {
    await apiSend("POST", `/media/${id}/entries`, {
      status: "COMPLETED",
      finishedAt: new Date().toISOString(),
    });
    setMsg("Logged!");
    reload();
  };
  const saveReview = async () => {
    const body = reviewBody || data.you.review?.body;
    if (!body) return;
    await apiSend("PUT", `/media/${id}/review`, { body, visibility: reviewVis });
    setReviewBody("");
    reloadReviews();
    reload();
  };
  const addToList = async (listId: string) => {
    await apiSend("POST", `/lists/${listId}/items`, { mediaItemId: id });
    setMsg("Added to list.");
  };

  return (
    <Flex direction="column" gap="5">
      <Flex gap="5" wrap="wrap">
        <div className="detail-cover">
          {data.coverImageUrl && <img src={data.coverImageUrl} alt="" />}
        </div>
        <Flex direction="column" gap="3" style={{ flex: 1, minWidth: 260 }}>
          <Flex direction="column" gap="1">
            <MediaTypeBadge
              type={data.type}
              size="2"
              style={{ alignSelf: "flex-start" }}
            />
            <Heading size="8">{data.title}</Heading>
            <Flex gap="2" align="center" wrap="wrap">
              {data.releaseDate && (
                <Text color="gray">
                  {new Date(data.releaseDate).getFullYear()}
                </Text>
              )}
              {bylineOf(data) && (
                <Text color="gray">· {bylineOf(data)}</Text>
              )}
            </Flex>
          </Flex>

          <Flex align="center" gap="3">
            <StarRating value={data.averageRating} />
            <Text color="gray" size="2">
              {data.averageRating != null
                ? `${data.averageRating.toFixed(1)} (${data.ratingCount})`
                : "No ratings yet"}
            </Text>
          </Flex>

          {factsOf(data).length > 0 && (
            <Flex gap="5" wrap="wrap">
              {factsOf(data).map((f) => (
                <Flex key={f.label} direction="column">
                  <Text size="1" color="gray">
                    {f.label}
                  </Text>
                  <Text size="2" weight="medium">
                    {f.value}
                  </Text>
                </Flex>
              ))}
            </Flex>
          )}

          {data.synopsis && <Text>{data.synopsis}</Text>}

          <Flex gap="3" wrap="wrap" align="center">
            <Button onClick={() => void log()}>Log a watch / read</Button>
            <Text size="1" color="gray">
              {data._count.entries} logs · {data._count.reviews} reviews
            </Text>
          </Flex>

          {myLists?.owned && myLists.owned.length > 0 && (
            <Flex gap="2" align="center">
              <Text size="2">Add to list:</Text>
              <Select
                placeholder="Choose…"
                onValueChange={(v) => void addToList(v as string)}
              >
                {myLists.owned.map((l) => (
                  <Select.Item key={l.id} value={l.id}>
                    {l.title}
                  </Select.Item>
                ))}
              </Select>
            </Flex>
          )}
          {msg && (
            <Text color="green" size="2">
              {msg}
            </Text>
          )}
        </Flex>
      </Flex>

      <Separator />

      <Flex direction="column" gap="3">
        <Heading size="5">Your rating</Heading>
        <StarRating value={yourStars} onChange={(s) => void rate(s)} size={30} />
      </Flex>

      <Flex direction="column" gap="3">
        <Heading size="5">Your review</Heading>
        {data.you.review && (
          <Card size="2">
            <Text>{data.you.review.body}</Text>
          </Card>
        )}
        <Textarea
          placeholder="Write a review…"
          value={reviewBody}
          onChange={(e) => setReviewBody(e.currentTarget.value)}
          rows={4}
        />
        <Flex gap="3" align="center" wrap="wrap">
          <Select
            value={reviewVis}
            onValueChange={(v) => setReviewVis(v as Visibility)}
            placeholder="Visibility"
          >
            <Select.Item value="PUBLIC">Public</Select.Item>
            <Select.Item value="UNLISTED">Unlisted</Select.Item>
            <Select.Item value="PRIVATE">Private</Select.Item>
          </Select>
          <Button onClick={() => void saveReview()}>Save review</Button>
        </Flex>
      </Flex>

      <Flex direction="column" gap="3">
        <Heading size="5">Reviews</Heading>
        {reviews && reviews.length === 0 && (
          <Text color="gray">No public reviews yet.</Text>
        )}
        {reviews?.map((r) => (
          <Card key={r.id} size="2">
            <Flex direction="column" gap="1">
              <Text weight="medium" size="2">
                @{r.user?.username ?? "you"}
              </Text>
              {r.title && <Text weight="medium">{r.title}</Text>}
              <Text>{r.body}</Text>
            </Flex>
          </Card>
        ))}
      </Flex>
    </Flex>
  );
}
