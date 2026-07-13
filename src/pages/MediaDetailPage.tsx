import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Field,
  Flex,
  Heading,
  Input,
  Select,
  Separator,
  Text,
  Textarea,
} from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { apiSend, apiUpload } from "../lib/api";
import { CopyButton } from "../components/CopyButton";
import { StarRating } from "../components/StarRating";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { MediaPicker } from "../components/MediaPicker";
import { MarkCompleteDialog } from "../components/MarkCompleteDialog";
import { AddToListDialog } from "../components/AddToListDialog";
import { CoverFinderDialog } from "../components/CoverFinderDialog";
import { StatusBadge } from "../components/StatusBadge";
import { MEDIA_FIELDS, formatFieldValue } from "../../shared/media-fields";
import { timeAgo } from "../lib/time";
import {
  RELATION_LABELS,
  type ListSummary,
  type MediaDetail,
  type MediaEntry,
  type MediaItem,
  type MediaRelationType,
  type Profile,
  type Review,
  type Visibility,
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
  const { data: entries, reload: reloadEntries } = useApiData<MediaEntry[]>(
    id ? `/media/${id}/entries` : null,
  );
  const { data: myLists, reload: reloadLists } = useApiData<{
    owned: ListSummary[];
  }>("/me/lists");
  const { data: me } = useApiData<Profile>("/me");
  const isAdmin = Boolean(me?.isAdmin);

  const [reviewBody, setReviewBody] = useState("");
  const [reviewVis, setReviewVis] = useState<Visibility>("PUBLIC");
  const [relType, setRelType] = useState<MediaRelationType>("ADAPTATION");
  const [seriesTitle, setSeriesTitle] = useState("");
  const [seriesPos, setSeriesPos] = useState("1");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [addListOpen, setAddListOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!data) return <Text color="gray">Loading…</Text>;

  const cfg = MEDIA_FIELDS[data.type];
  const gerund = `${cfg.logVerb}ing`;
  const yourStars = data.you.rating ? Number(data.you.rating.stars) : null;
  const active =
    data.you.lastEntry && data.you.lastEntry.status === "IN_PROGRESS"
      ? data.you.lastEntry
      : null;
  const refresh = () => {
    reload();
    reloadEntries();
  };

  const rate = async (stars: number) => {
    await apiSend("PUT", `/media/${id}/rating`, { stars });
    reload();
  };
  const start = async () => {
    await apiSend("POST", `/media/${id}/entries`, {
      status: "IN_PROGRESS",
      startedAt: new Date().toISOString(),
    });
    setMsg(`Started ${gerund}.`);
    refresh();
  };
  const abandon = async () => {
    if (!active) return;
    await apiSend("PATCH", `/media/${id}/entries/${active.id}`, {
      status: "ABANDONED",
    });
    setMsg("Marked as abandoned.");
    refresh();
  };
  const complete = async ({
    stars,
    reviewBody,
    visibility,
  }: {
    stars: number | null;
    reviewBody: string;
    visibility: Visibility;
  }) => {
    if (active) {
      await apiSend("PATCH", `/media/${id}/entries/${active.id}`, {
        status: "COMPLETED",
        finishedAt: new Date().toISOString(),
      });
    } else {
      await apiSend("POST", `/media/${id}/entries`, {
        status: "COMPLETED",
        finishedAt: new Date().toISOString(),
      });
    }
    if (stars != null) await apiSend("PUT", `/media/${id}/rating`, { stars });
    if (reviewBody) {
      await apiSend("PUT", `/media/${id}/review`, {
        body: reviewBody,
        visibility,
      });
    }
    setMsg(`Marked as ${cfg.logPast}.`);
    refresh();
    reloadReviews();
  };
  const saveReview = async () => {
    const body = reviewBody || data.you.review?.body;
    if (!body) return;
    await apiSend("PUT", `/media/${id}/review`, { body, visibility: reviewVis });
    setReviewBody("");
    reloadReviews();
    reload();
  };
  const linkRelated = async (media: MediaItem) => {
    await apiSend("POST", `/media/${id}/relations`, {
      toId: media.id,
      type: relType,
    });
    setMsg(`Linked ${media.title}.`);
    reload();
  };
  const unlinkRelated = async (relId: string) => {
    await apiSend("DELETE", `/media/${id}/relations/${relId}`);
    reload();
  };
  const addToSeries = async () => {
    if (!seriesTitle.trim()) return;
    const s = await apiSend<{ id: string }>("POST", "/series", {
      title: seriesTitle.trim(),
    });
    await apiSend("POST", `/series/${s.id}/items`, {
      mediaItemId: id,
      position: Number(seriesPos) || 1,
    });
    setSeriesTitle("");
    setMsg("Added to series.");
    reload();
  };
  const changeVisibility = async (v: Visibility) => {
    await apiSend("PATCH", `/media/${id}/moderation`, { visibility: v });
    reload();
  };
  const toggleArchive = async () => {
    await apiSend("PATCH", `/media/${id}/moderation`, {
      archived: !data.archivedAt,
    });
    setMsg(data.archivedAt ? "Unarchived." : "Archived.");
    reload();
  };
  const uploadCover = async (file: File | undefined) => {
    if (!file) return;
    setCoverUploading(true);
    setMsg(null);
    try {
      await apiUpload(`/media/${id}/cover/upload`, file);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setCoverUploading(false);
    }
  };

  return (
    <Flex direction="column" gap="5">
      <Flex gap="5" wrap="wrap">
        <Flex direction="column" gap="2" align="center">
          <div className="detail-cover">
            {data.coverImageUrl && <img src={data.coverImageUrl} alt="" />}
          </div>
          {!data.coverImageUrl && (
            <Flex direction="column" gap="1" align="center">
              <Flex gap="2">
                <Button
                  size="1"
                  variant="soft"
                  onClick={() => setCoverOpen(true)}
                >
                  Find a cover
                </Button>
                <Button
                  size="1"
                  variant="soft"
                  loading={coverUploading}
                  onClick={() => coverFileRef.current?.click()}
                >
                  Upload
                </Button>
              </Flex>
              <input
                ref={coverFileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => void uploadCover(e.currentTarget.files?.[0])}
              />
              <Text
                size="1"
                color="gray"
                align="center"
                style={{ maxWidth: 190 }}
              >
                By uploading, you confirm you have permission to use this image.
              </Text>
            </Flex>
          )}
          <CoverFinderDialog
            open={coverOpen}
            onOpenChange={setCoverOpen}
            mediaId={data.id}
            title={data.title}
            onChanged={reload}
          />
        </Flex>
        <Flex direction="column" gap="3" style={{ flex: 1, minWidth: 260 }}>
          <Flex direction="column" gap="1">
            <Flex gap="2" align="center" wrap="wrap">
              <MediaTypeBadge type={data.type} size="2" />
              {data.archivedAt && (
                <Badge color="red" variant="soft" size="1">
                  Archived
                </Badge>
              )}
              {data.visibility !== "PUBLIC" && (
                <Badge color="gray" variant="soft" size="1">
                  {data.visibility.toLowerCase()}
                </Badge>
              )}
            </Flex>
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
            {data.series.length > 0 && (
              <Flex gap="2" wrap="wrap">
                {data.series.map((s) => (
                  <Badge key={s.id} variant="soft" color="gray">
                    {MEDIA_FIELDS[data.type].label} {s.position} of {s.total} ·{" "}
                    {s.title}
                  </Badge>
                ))}
              </Flex>
            )}
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

          {data.genres.length > 0 && (
            <Flex gap="2" wrap="wrap">
              {data.genres.map((g) => (
                <Badge key={g.id} variant="soft" color="gray">
                  {g.name}
                </Badge>
              ))}
            </Flex>
          )}

          {data.synopsis && <Text>{data.synopsis}</Text>}

          <Flex gap="2" wrap="wrap" align="center">
            {active ? (
              <>
                <Button onClick={() => setCompleteOpen(true)}>
                  Finish {gerund}
                </Button>
                <Button
                  variant="soft"
                  color="red"
                  onClick={() => void abandon()}
                >
                  Abandon
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => setCompleteOpen(true)}>
                  Mark as {cfg.logPast}
                </Button>
                <Button variant="soft" onClick={() => void start()}>
                  Start {gerund}
                </Button>
              </>
            )}
            <Text size="1" color="gray">
              {data._count.entries} logs · {data._count.reviews} reviews
            </Text>
          </Flex>

          <MarkCompleteDialog
            open={completeOpen}
            onOpenChange={setCompleteOpen}
            verbPast={cfg.logPast}
            initialStars={yourStars}
            initialReview={data.you.review?.body ?? ""}
            onConfirm={complete}
          />

          <Flex>
            <Button variant="soft" onClick={() => setAddListOpen(true)}>
              Add to list
            </Button>
          </Flex>

          <AddToListDialog
            open={addListOpen}
            onOpenChange={setAddListOpen}
            mediaId={data.id}
            lists={myLists?.owned ?? []}
            onChanged={reloadLists}
          />
          {msg && (
            <Text color="green" size="2">
              {msg}
            </Text>
          )}

          <Flex gap="3" align="center" wrap="wrap">
            <Text size="1" color="gray">
              {data.createdBy
                ? `Added by ${data.createdBy.displayName ?? `@${data.createdBy.username}`} · `
                : "Added "}
              {timeAgo(data.createdAt)}
            </Text>
            {data.visibility === "PUBLIC" && !data.archivedAt && (
              <CopyButton
                value={`${window.location.origin}/m/${data.id}`}
                label="Copy share link"
                copiedLabel="Link copied!"
              />
            )}
          </Flex>
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
        <Heading size="5">Your journey</Heading>
        {(!entries || entries.length === 0) && (
          <Text color="gray">
            No activity yet — start or mark it {cfg.logPast}.
          </Text>
        )}
        <Flex direction="column" gap="2">
          {entries?.map((e) => (
            <Card key={e.id} size="1">
              <Flex direction="column" gap="1">
                <Flex justify="space-between" gap="2" wrap="wrap" align="center">
                  <Flex gap="2" align="center">
                    <StatusBadge status={e.status} />
                    {e.progress && (
                      <Text size="1" color="gray">
                        {e.progress}
                      </Text>
                    )}
                  </Flex>
                  <Text size="1" color="gray">
                    {timeAgo(e.finishedAt ?? e.startedAt)}
                  </Text>
                </Flex>
                {e.note && <Text size="2">{e.note}</Text>}
              </Flex>
            </Card>
          ))}
        </Flex>
      </Flex>

      {(data.related.length > 0 || isAdmin) && (
        <Flex direction="column" gap="3">
          <Heading size="5">Connections</Heading>

          {data.related.length > 0 && (
            <Flex direction="column" gap="2">
              {data.related.map((r) => (
                <Flex key={r.id} justify="space-between" align="center" gap="2">
                  <Flex gap="2" align="center" wrap="wrap">
                    <MediaTypeBadge type={r.media.type} />
                    <Link
                      to={`/media/${r.media.id}`}
                      className="media-card-link"
                    >
                      <Text weight="medium">{r.media.title}</Text>
                    </Link>
                    <Badge variant="soft" size="1">
                      {RELATION_LABELS[r.type]}
                    </Badge>
                  </Flex>
                  {isAdmin && (
                    <Button
                      size="1"
                      variant="ghost"
                      onClick={() => void unlinkRelated(r.id)}
                    >
                      Remove
                    </Button>
                  )}
                </Flex>
              ))}
            </Flex>
          )}

          {isAdmin && (
            <>
              <Card size="2">
                <Flex direction="column" gap="2">
                  <Text weight="medium" size="2">
                    Link related media
                  </Text>
                  <Select
                    value={relType}
                    onValueChange={(v) => setRelType(v as MediaRelationType)}
                  >
                    {(Object.keys(RELATION_LABELS) as MediaRelationType[]).map(
                      (t) => (
                        <Select.Item key={t} value={t}>
                          {RELATION_LABELS[t]}
                        </Select.Item>
                      ),
                    )}
                  </Select>
                  <MediaPicker
                    excludeId={data.id}
                    onPick={(m) => void linkRelated(m)}
                  />
                </Flex>
              </Card>

              <Card size="2">
                <Flex direction="column" gap="2">
                  <Text weight="medium" size="2">
                    Add to a new series
                  </Text>
                  <Flex gap="2" wrap="wrap" align="end">
                    <Field label="Series title">
                      <Input
                        value={seriesTitle}
                        onChange={(e) => setSeriesTitle(e.currentTarget.value)}
                        placeholder="e.g. The Lord of the Rings"
                      />
                    </Field>
                    <Field label="#">
                      <Input
                        type="number"
                        value={seriesPos}
                        onChange={(e) => setSeriesPos(e.currentTarget.value)}
                        style={{ width: 72 }}
                      />
                    </Field>
                    <Button onClick={() => void addToSeries()}>Add</Button>
                  </Flex>
                </Flex>
              </Card>
            </>
          )}
        </Flex>
      )}

      {isAdmin && (
        <Flex direction="column" gap="3">
          <Heading size="5">Moderation</Heading>
          <Card size="2">
            <Flex gap="3" wrap="wrap" align="end">
              <Field label="Visibility">
                <Select
                  value={data.visibility}
                  onValueChange={(v) => void changeVisibility(v as Visibility)}
                >
                  <Select.Item value="PUBLIC">Public</Select.Item>
                  <Select.Item value="UNLISTED">Unlisted</Select.Item>
                  <Select.Item value="PRIVATE">Private</Select.Item>
                </Select>
              </Field>
              <Button
                variant="soft"
                color={data.archivedAt ? "green" : "red"}
                onClick={() => void toggleArchive()}
              >
                {data.archivedAt ? "Unarchive" : "Archive"}
              </Button>
            </Flex>
          </Card>
        </Flex>
      )}

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
