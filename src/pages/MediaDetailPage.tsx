import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronDown,
  ExternalLink,
  ListPlus,
  RefreshCw,
  Search,
  Share2,
  Shield,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Collapsible,
  Dialog,
  Field,
  Flex,
  Heading,
  Input,
  Select,
  Separator,
  Text,
  Textarea,
} from "@wlcr/base-ic";
import { useApiData, type Page } from "../lib/hooks";
import { useAdminMode } from "../lib/admin-mode";
import { apiSend } from "../lib/api";
import { CopyButton } from "../components/CopyButton";
import { StarRating } from "../components/StarRating";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { RecCard, RecCardSkeleton } from "../components/RecCard";
import { GenreEditor } from "../components/GenreEditor";
import { MediaDescriptions } from "../components/MediaDescriptions";
import { MediaPicker } from "../components/MediaPicker";
import { MarkCompleteDialog } from "../components/MarkCompleteDialog";
import { AddToListDialog } from "../components/AddToListDialog";
import { CoverFinderDialog } from "../components/CoverFinderDialog";
import { CoverUploadDialog } from "../components/CoverUploadDialog";
import { RescrapeDialog } from "../components/RescrapeDialog";
import { DescriptionSourceDialog } from "../components/DescriptionSourceDialog";
import { MediaDetailSkeleton } from "../components/MediaDetailSkeleton";
import { TvSeasons } from "../components/TvSeasons";
import { CoverGallery, type CoverInfo } from "../components/CoverGallery";
import { LibbyLookup } from "../components/LibbyLookup";
import { WikipediaLinkEditor } from "../components/WikipediaLinkEditor";
import { WikipediaLookup } from "../components/WikipediaLookup";
import { WhereToWatch } from "../components/WhereToWatch";
import { StreamingEditor } from "../components/StreamingEditor";
import { MediaFeedbackDialog } from "../components/MediaFeedbackDialog";
import { StatusBadge } from "../components/StatusBadge";
import { SegmentedControl } from "../components/SegmentedControl";
import {
  MEDIA_FIELDS,
  formatFieldValue,
  titleCase,
} from "../../shared/media-fields";
import { timeAgo } from "../lib/time";
import {
  RELATION_LABELS,
  VISIBILITY_OPTIONS,
  // type ListSummary,
  type MediaDetail,
  type MediaEntry,
  type MediaItem,
  type MediaRelationType,
  type Profile,
  type Recommendation,
  type Review,
  type Visibility,
} from "../lib/types";

/** Headline credit (e.g. "Directed by …") from the type's primary role. */
function bylineOf(
  data: MediaDetail,
): { prefix?: string; names: string[] } | undefined {
  const cfg = MEDIA_FIELDS[data.type];
  const role = cfg.primaryCredit;
  if (!role) return undefined;
  const names = (data.credits ?? [])
    .filter((c) => c.role === role)
    .map((c) => c.name);
  if (!names.length) return undefined;
  return { prefix: cfg.credits.find((c) => c.role === role)?.byline, names };
}

/** Type-specific facts (runtime, pages, seasons…), config-driven. */
function factsOf(data: MediaDetail): { label: string; value: string }[] {
  return MEDIA_FIELDS[data.type].fields
    .map((spec) => ({
      label: spec.label,
      value: formatFieldValue(spec, data[spec.key]),
    }))
    .filter(
      (f): f is { label: string; value: string } => f.value !== undefined,
    );
}

/**
 * Keyed on the media id so navigating from one media item to another remounts
 * the page rather than reusing it — the previous item's data/scroll state is
 * torn down cleanly instead of morphing into the next, which reads as jank.
 */
export function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <MediaDetailContent key={id ?? "none"} />;
}

function MediaDetailContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, reload } = useApiData<MediaDetail>(id ? `/media/${id}` : null);
  const { data: reviews, reload: reloadReviews } = useApiData<Review[]>(
    id ? `/media/${id}/reviews` : null,
  );
  const { data: entries, reload: reloadEntries } = useApiData<MediaEntry[]>(
    id ? `/media/${id}/entries` : null,
  );
  const { data: me } = useApiData<Profile>("/me");
  const { data: listMembership, reload: reloadMembership } = useApiData<{
    lists: { id: string; title: string; visibility: string }[];
  }>(id ? `/me/lists/containing/${id}` : null);
  const isAdmin = Boolean(me?.isAdmin);
  const { data: covers, reload: reloadCovers } = useApiData<CoverInfo[]>(
    id ? `/media/${id}/covers` : null,
  );
  const { data: similar, loading: similarLoading } = useApiData<
    Page<Recommendation>
  >(id ? `/media/${id}/similar?limit=6` : null);

  const [reviewBody, setReviewBody] = useState("");
  const [reviewVis, setReviewVis] = useState<Visibility>("PUBLIC");
  const [relType, setRelType] = useState<MediaRelationType>("ADAPTATION");
  const [seriesTitle, setSeriesTitle] = useState("");
  const [seriesPos, setSeriesPos] = useState("1");
  const [completeOpen, setCompleteOpen] = useState(false);
  // When the user clicks the aggregate rating without having rated yet, we open
  // the mark-complete dialog pre-filled with the stars they clicked.
  const [prefillStars, setPrefillStars] = useState<number | null>(null);
  const [addListOpen, setAddListOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [rescrapeOpen, setRescrapeOpen] = useState(false);
  const [descSourceOpen, setDescSourceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adminMode, setAdminMode] = useAdminMode();
  const [coverBusy, setCoverBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);

  // Admin affordances only render when an admin flips into admin mode.
  const showAdmin = isAdmin && adminMode;
  const libby = data?.externalIds?.find((e) => e.source === "LIBBY");

  if (!data) return <MediaDetailSkeleton />;

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

  // Split "Your journey" into show-level milestones (start/finish/rewatch) and
  // per-episode watches, so episode ticks don't drown the page in identical
  // "Completed" rows.
  const showMilestones = entries?.filter((e) => !e.episode) ?? [];
  const episodeWatches = entries?.filter((e) => e.episode) ?? [];
  // Has the user finished this at least once? De-emphasizes the primary
  // start/complete actions (they become gray) once they have.
  const hasConsumed = showMilestones.some((e) => e.status === "COMPLETED");
  const EPISODE_PREVIEW = 6;
  const visibleEpisodeWatches = showAllEpisodes
    ? episodeWatches
    : episodeWatches.slice(0, EPISODE_PREVIEW);

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
    await apiSend("PUT", `/media/${id}/review`, {
      body,
      visibility: reviewVis,
    });
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
  const remove = async () => {
    setDeleting(true);
    try {
      await apiSend("DELETE", `/media/${id}`);
      navigate("/catalog");
    } catch (e) {
      setMsg((e as Error).message);
      setDeleting(false);
    }
  };
  // After a cover mutation, refresh both the cover list and the header cover.
  const refreshCovers = () => {
    reloadCovers();
    reload();
  };
  const setPrimaryCover = async (assetId: string) => {
    setCoverBusy(assetId);
    try {
      await apiSend("POST", `/media/${id}/covers/${assetId}/primary`);
      refreshCovers();
    } finally {
      setCoverBusy(null);
    }
  };
  const removeCover = async (assetId: string) => {
    setCoverBusy(assetId);
    try {
      await apiSend("DELETE", `/media/${id}/covers/${assetId}`);
      refreshCovers();
    } finally {
      setCoverBusy(null);
    }
  };
  // Until the covers endpoint responds, fall back to the header cover so the
  // primary shows without a flash of the placeholder.
  const coverList: CoverInfo[] =
    covers ??
    (data.coverImageUrl
      ? [{ id: "primary", url: data.coverImageUrl, isPrimary: true }]
      : []);
  return (
    <Flex direction="column" gap="5">
      <Flex justify="end" align="center" gap="2">
        {isAdmin && (
          <>
            <Text size="1" color="gray">
              {adminMode ? "Editing as admin" : ""}
            </Text>
            <Button
              size="1"
              variant={adminMode ? "solid" : "soft"}
              color={adminMode ? "amber" : "gray"}
              onClick={() => setAdminMode((v) => !v)}
            >
              <Shield size={14} aria-hidden />
              {adminMode ? "Admin mode: on" : "Admin mode"}
            </Button>
          </>
        )}
        {data.visibility === "PUBLIC" && !data.archivedAt && (
          <CopyButton
            value={`${window.location.origin}/m/${data.id}`}
            label="Share"
            copiedLabel="Link copied!"
            icon={<Share2 size={14} aria-hidden />}
            color="cyan"
          />
        )}
      </Flex>

      <Flex gap="5" wrap="wrap">
        <Flex direction="column" gap="2" align="center">
          <CoverGallery
            type={data.type}
            title={data.title}
            covers={coverList}
            className="detail-cover"
            admin={
              showAdmin
                ? {
                    busyId: coverBusy,
                    onSetPrimary: setPrimaryCover,
                    onRemove: removeCover,
                  }
                : undefined
            }
          />

          {(showAdmin || coverList.length === 0) && (
            <Flex gap="2" wrap="wrap" justify="center">
              <Button
                size="1"
                variant="soft"
                onClick={() => setCoverOpen(true)}
              >
                <Search size={14} aria-hidden />{" "}
                {coverList.length === 0 ? "Find a cover" : "Find more"}
              </Button>
              <Button
                size="1"
                variant="soft"
                onClick={() => setUploadOpen(true)}
              >
                <Upload size={14} aria-hidden /> Upload
              </Button>
            </Flex>
          )}

          <CoverFinderDialog
            open={coverOpen}
            onOpenChange={setCoverOpen}
            mediaId={data.id}
            title={data.title}
            onChanged={refreshCovers}
          />

          <CoverUploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            mediaId={data.id}
            onChanged={refreshCovers}
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
            {data.subtitle && (
              <Text size="4" color="gray">
                {data.subtitle}
              </Text>
            )}
            <Flex gap="2" align="center" wrap="wrap">
              {data.airRange ? (
                <Text color="gray">
                  {data.airRange.ongoing
                    ? `${data.airRange.startYear}–Present`
                    : data.airRange.startYear === data.airRange.endYear
                      ? `${data.airRange.startYear}`
                      : `${data.airRange.startYear}–${data.airRange.endYear}`}
                </Text>
              ) : (
                data.releaseDate && (
                  <Text color="gray">
                    {new Date(data.releaseDate).getFullYear()}
                  </Text>
                )
              )}
              {(() => {
                const b = bylineOf(data);
                if (!b) return null;
                return (
                  <Text color="gray">
                    · {b.prefix ? `${b.prefix} ` : ""}
                    {b.names.map((name, i) => (
                      <span key={name}>
                        {i > 0 && ", "}
                        <Link
                          to={`/catalog?credit=${encodeURIComponent(name)}`}
                          className="byline-link"
                        >
                          {name}
                        </Link>
                      </span>
                    ))}
                  </Text>
                );
              })()}
            </Flex>
            {data.series.length > 0 && (
              <Flex gap="2" wrap="wrap">
                {data.series.map((s) => (
                  <Link
                    key={s.id}
                    to={`/series/${s.id}`}
                    className="badge-link"
                  >
                    <Badge variant="soft" color="gray">
                      {MEDIA_FIELDS[data.type].label} {s.position} of {s.total}{" "}
                      · {s.title}
                    </Badge>
                  </Link>
                ))}
              </Flex>
            )}
          </Flex>

          <Flex align="center" gap="3">
            <StarRating
              value={data.averageRating}
              // Unrated users can click straight into rating: opens the
              // mark-complete dialog pre-filled with the stars they picked.
              onChange={
                data.you.rating
                  ? undefined
                  : (s) => {
                      setPrefillStars(s);
                      setCompleteOpen(true);
                    }
              }
            />
            <Text color="gray" size="2">
              {data.averageRating != null
                ? `${data.averageRating.toFixed(1)} (${data.ratingCount})`
                : "No ratings yet"}
            </Text>
          </Flex>

          {factsOf(data).length > 0 && (
            <Flex gap="5" wrap="wrap">
              {factsOf(data).map((f) => (
                <Flex key={f.label} direction="column" gap="0">
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

          {showAdmin ? (
            <GenreEditor
              mediaId={data.id}
              mediaType={data.type}
              genres={data.genres}
              onChanged={reload}
            />
          ) : (
            data.genres.length > 0 && (
              <Flex gap="2" wrap="wrap">
                {data.genres.map((g) => (
                  <Link
                    key={g.id}
                    to={`/catalog?genre=${encodeURIComponent(g.slug)}`}
                    className="badge-link"
                  >
                    <Badge variant="soft" color="gray">
                      {titleCase(g.name)}
                    </Badge>
                  </Link>
                ))}
              </Flex>
            )
          )}

          <MediaDescriptions
            shortDescription={data.shortDescription}
            synopsis={data.synopsis}
          />

          {data.wikipediaUrl && (
            <Flex>
              <a
                href={data.wikipediaUrl}
                target="_blank"
                rel="noreferrer"
                className="ext-link"
              >
                <ExternalLink size={14} aria-hidden /> Wikipedia
              </a>
            </Flex>
          )}

          <WhereToWatch streaming={data.streaming} />

          {libby?.url && (
            <Flex>
              <a
                href={libby.url}
                target="_blank"
                rel="noreferrer"
                className="ext-link"
              >
                <ExternalLink size={14} aria-hidden /> Borrow on Libby
              </a>
            </Flex>
          )}

          <Flex gap="2" wrap="wrap" align="center">
            {active ? (
              <>
                <Button
                  onClick={() => {
                    setPrefillStars(null);
                    setCompleteOpen(true);
                  }}
                >
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
                <Button
                  color={hasConsumed ? "gray" : undefined}
                  onClick={() => {
                    setPrefillStars(null);
                    setCompleteOpen(true);
                  }}
                >
                  {hasConsumed ? `Re-${cfg.logVerb}` : `Mark as ${cfg.logPast}`}
                </Button>
                <Button
                  variant="soft"
                  color={hasConsumed ? "gray" : undefined}
                  onClick={() => void start()}
                >
                  {hasConsumed ? `Start re-${gerund}` : `Start ${gerund}`}
                </Button>
              </>
            )}
            <Text size="1" color="gray">
              {data._count.entries} logs · {data._count.reviews} reviews
            </Text>
          </Flex>

          <MarkCompleteDialog
            open={completeOpen}
            onOpenChange={(o) => {
              setCompleteOpen(o);
              if (!o) setPrefillStars(null);
            }}
            verbPast={cfg.logPast}
            initialStars={prefillStars ?? yourStars}
            initialReview={data.you.review?.body ?? ""}
            onConfirm={complete}
          />

          {listMembership && listMembership.lists.length > 0 && (
            <Flex gap="2" align="center" wrap="wrap">
              <Text size="1" color="gray">
                On your lists:
              </Text>
              {listMembership.lists.map((l) => (
                <Link
                  key={l.id}
                  to={`/lists/${l.id}`}
                  className="media-card-link"
                >
                  <Badge variant="soft" size="1" color="gray">
                    {l.title}
                  </Badge>
                </Link>
              ))}
            </Flex>
          )}

          <Flex>
            <Button variant="soft" onClick={() => setAddListOpen(true)}>
              <ListPlus size={16} aria-hidden />{" "}
              {listMembership && listMembership.lists.length > 0
                ? "Add or remove from lists"
                : "Add to list"}
            </Button>
          </Flex>

          <AddToListDialog
            open={addListOpen}
            onOpenChange={setAddListOpen}
            mediaId={data.id}
            onChanged={reloadMembership}
          />
          {msg && (
            <Text color="green" size="2">
              {msg}
            </Text>
          )}
        </Flex>
      </Flex>

      <Separator />

      <Flex gap="3" align="center" justify="space-between" wrap="wrap">
        <Text size="1" color="gray">
          {data.createdBy ? (
            <>
              Added by{" "}
              <Link
                to={`/u/${data.createdBy.username}`}
                className="byline-link"
              >
                @{data.createdBy.username}
              </Link>{" "}
              ·{" "}
            </>
          ) : (
            "Added "
          )}
          {timeAgo(data.createdAt)}
        </Text>
        <MediaFeedbackDialog media={data} />
      </Flex>

      <Flex direction="column" gap="3">
        <Heading size="5">Your rating</Heading>
        <StarRating
          value={yourStars}
          onChange={(s) => void rate(s)}
          size={30}
        />
      </Flex>

      <Flex direction="column" gap="3">
        <Flex justify="between" align="center" gap="3" wrap="wrap">
          <Heading size="5">Your review</Heading>
          <SegmentedControl
            value={reviewVis}
            onChange={setReviewVis}
            options={VISIBILITY_OPTIONS}
            size="1"
            ariaLabel="Review visibility"
          />
        </Flex>
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
        <Flex justify="end">
          <Button onClick={() => void saveReview()}>Save review</Button>
        </Flex>
      </Flex>

      {data.type === "TV_SHOW" && (
        <TvSeasons
          mediaId={data.id}
          isAdmin={showAdmin}
          onProgressChange={() => {
            reload();
            reloadEntries();
          }}
        />
      )}

      <Flex direction="column" gap="3">
        <Heading size="5">Your journey</Heading>
        {(!entries || entries.length === 0) && (
          <Text color="gray">
            No activity yet — start or mark it {cfg.logPast}.
          </Text>
        )}

        {/* Show-level milestones: starts, completions, rewatches. */}
        {showMilestones.length > 0 && (
          <Flex direction="column" gap="2">
            {showMilestones.map((e) => (
              <Card key={e.id} size="1">
                <Flex direction="column" gap="1">
                  <Flex
                    justify="space-between"
                    gap="2"
                    wrap="wrap"
                    align="center"
                  >
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
        )}

        {/* Per-episode watches, compact and labeled by S·E + title. */}
        {episodeWatches.length > 0 && (
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Episodes watched ({episodeWatches.length})
            </Text>
            {visibleEpisodeWatches.map((e) => (
              <Flex
                key={e.id}
                justify="between"
                align="center"
                gap="3"
                className="episode-log-row"
              >
                <Flex gap="2" align="baseline" className="shrink">
                  <Badge variant="soft" size="1">
                    S{e.episode!.season.number}·E{e.episode!.number}
                  </Badge>
                  <Text size="2" truncate>
                    {e.episode!.title || `Episode ${e.episode!.number}`}
                  </Text>
                </Flex>
                <Text size="1" color="gray">
                  {timeAgo(e.finishedAt ?? e.startedAt)}
                </Text>
              </Flex>
            ))}
            {episodeWatches.length > EPISODE_PREVIEW && (
              <Button
                size="1"
                variant="ghost"
                onClick={() => setShowAllEpisodes((v) => !v)}
                style={{ alignSelf: "start" }}
              >
                {showAllEpisodes
                  ? "Show less"
                  : `Show all ${episodeWatches.length}`}
              </Button>
            )}
          </Flex>
        )}
      </Flex>

      {(data.related.length > 0 || showAdmin) && (
        <Flex direction="column" gap="3">
          <Heading size="5">Connections</Heading>

          {data.related.length > 0 && (
            <Flex direction="column" gap="2">
              {data.related.map((r) => (
                <Flex key={r.id} justify="space-between" align="center" gap="2">
                  <Flex direction="column" gap="1" align="start">
                    <Text size="1" color="gray">
                      {RELATION_LABELS[r.type]}
                    </Text>
                    <Flex gap="2" align="center" wrap="wrap">
                      <MediaTypeBadge type={r.media.type} />
                      <Link to={`/media/${r.media.id}`}>
                        <Text weight="medium">{r.media.title}</Text>
                      </Link>
                    </Flex>
                  </Flex>
                  {showAdmin && (
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

          {showAdmin && (
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

      {showAdmin && (
        <Flex direction="column" gap="3">
          <Flex gap="2" align="center">
            <Shield size={18} aria-hidden className="dim-icon" />
            <Heading size="5">Admin tools</Heading>
          </Flex>

          <Card size="2">
            <Flex direction="column" gap="2" align="start">
              <Text size="2" weight="medium">
                Data
              </Text>
              <Flex gap="2" wrap="wrap">
                <Button variant="soft" onClick={() => setRescrapeOpen(true)}>
                  <RefreshCw size={16} aria-hidden /> Re-scrape data
                </Button>
                <Button
                  variant="soft"
                  onClick={() => setDescSourceOpen(true)}
                >
                  <Sparkles size={16} aria-hidden /> Improve description
                </Button>
              </Flex>
              <Text size="1" color="gray">
                Cover artwork is managed above, next to the cover.
              </Text>
            </Flex>
          </Card>

          <Card size="2">
            <Collapsible defaultOpen={!libby}>
              <Collapsible.Trigger className="section-collapse-trigger">
                <ChevronDown size={16} aria-hidden className="section-chevron" />
                <Text size="2" weight="medium">
                  Libby / OverDrive
                </Text>
                {libby && (
                  <Badge
                    size="1"
                    variant="soft"
                    color="grass"
                    style={{ marginLeft: "auto" }}
                  >
                    Linked
                  </Badge>
                )}
              </Collapsible.Trigger>
              <Collapsible.Content>
                <Flex direction="column" gap="2" style={{ paddingTop: 8 }}>
                  <LibbyLookup
                    mediaId={data.id}
                    title={data.title}
                    currentType={data.type}
                    currentLibbyId={libby?.value}
                    onChanged={reload}
                  />
                </Flex>
              </Collapsible.Content>
            </Collapsible>
          </Card>

          <Card size="2">
            <Collapsible defaultOpen={!data.wikipediaUrl}>
              <Collapsible.Trigger className="section-collapse-trigger">
                <ChevronDown size={16} aria-hidden className="section-chevron" />
                <Text size="2" weight="medium">
                  Wikipedia
                </Text>
                {data.wikipediaUrl && (
                  <Badge
                    size="1"
                    variant="soft"
                    color="grass"
                    style={{ marginLeft: "auto" }}
                  >
                    Linked
                  </Badge>
                )}
              </Collapsible.Trigger>
              <Collapsible.Content>
                <Flex direction="column" gap="3" style={{ paddingTop: 8 }}>
                  <WikipediaLookup
                    mediaId={data.id}
                    title={data.title}
                    currentUrl={data.wikipediaUrl}
                    onChanged={reload}
                  />
                  <details className="manual-fallback">
                    <summary>
                      <Text size="1" color="gray">
                        Or paste a link manually
                      </Text>
                    </summary>
                    <WikipediaLinkEditor
                      mediaId={data.id}
                      currentUrl={data.wikipediaUrl}
                      onChanged={reload}
                    />
                  </details>
                </Flex>
              </Collapsible.Content>
            </Collapsible>
          </Card>

          {(data.type === "MOVIE" || data.type === "TV_SHOW") && (
            <Card size="2">
              <Flex direction="column" gap="3">
                <Text size="2" weight="medium">
                  Streaming availability
                </Text>
                <StreamingEditor
                  mediaId={data.id}
                  streaming={data.streaming}
                  onChanged={reload}
                />
              </Flex>
            </Card>
          )}

          <Card size="2">
            <Flex gap="3" wrap="wrap" align="end" justify="space-between">
              <Flex gap="3" wrap="wrap" align="end">
                <Field label="Visibility">
                  <Select
                    value={data.visibility}
                    onValueChange={(v) =>
                      void changeVisibility(v as Visibility)
                    }
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
              <Button
                variant="soft"
                color="red"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={16} aria-hidden /> Delete
              </Button>
            </Flex>
          </Card>

          <RescrapeDialog
            open={rescrapeOpen}
            onOpenChange={setRescrapeOpen}
            mediaId={data.id}
            onChanged={reload}
          />

          <DescriptionSourceDialog
            open={descSourceOpen}
            onOpenChange={setDescSourceOpen}
            mediaId={data.id}
            onChanged={reload}
          />

          <Dialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete this item?"
            description="This can't be undone."
            content={
              <Text size="2" color="gray">
                “{data.title}” and all of its ratings, reviews, logs, series
                links, and relations will be permanently removed.
              </Text>
            }
            footer={
              <Flex gap="2" justify="end">
                <Button
                  variant="soft"
                  color="gray"
                  onClick={() => setDeleteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  color="red"
                  loading={deleting}
                  onClick={() => void remove()}
                >
                  Delete permanently
                </Button>
              </Flex>
            }
          >
            <span style={{ display: "none" }} aria-hidden />
          </Dialog>
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

      {(similarLoading || (similar && similar.items.length > 0)) && (
        <Flex direction="column" gap="3">
          <Flex justify="space-between" align="center" gap="3" wrap="wrap">
            <Heading size="5">More like this</Heading>
            {similar?.nextCursor && (
              <Link to={`/media/${data.id}/similar`} className="byline-link">
                <Text size="2" color="gray">
                  View more
                </Text>
              </Link>
            )}
          </Flex>
          <div className="media-grid">
            {similarLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <RecCardSkeleton key={i} />
                ))
              : similar!.items.map((rec) => (
                  <RecCard
                    key={rec.media.id}
                    media={rec.media}
                    reason={rec.reason}
                  />
                ))}
          </div>
        </Flex>
      )}
    </Flex>
  );
}
