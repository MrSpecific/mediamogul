import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, Flex, Heading, Text } from "@wlcr/base-ic";
import {
  BookSearchIcon,
  ListCheckIcon,
  PlusCircle,
  PlusCircleIcon,
  Sparkles,
  Star,
  Tv,
  UserCheckIcon,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { StatusBadge } from "../components/StatusBadge";
import { RecCard, RecCardSkeleton } from "../components/RecCard";
import { formatDate, timeAgo } from "../lib/time";
import type {
  ActivityItem,
  ListSummary,
  Profile,
  Recommendation,
} from "../lib/types";

export function HomePage() {
  const navigate = useNavigate();
  const { data: me } = useApiData<Profile>("/me");
  const { data: activity } = useApiData<ActivityItem[]>("/me/activity");
  const { data: starred } = useApiData<ListSummary[]>("/me/starred");
  const { data: recommendations, loading: recsLoading } = useApiData<
    Recommendation[]
  >("/me/recommendations?excludeListed=1");

  // Local, optimistic feedback state. Thumbs up/down toggle a pressed state;
  // hide (and any thumbs press implies a persisted signal) removes on reload.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [signals, setSignals] = useState<Record<string, "UP" | "DOWN">>({});

  const sendFeedback = (
    mediaId: string,
    signal: "UP" | "DOWN" | "HIDE" | null,
  ) =>
    void apiSend("PUT", `/me/recommendations/${mediaId}/feedback`, {
      signal,
    }).catch(() => undefined);

  const onSignal = (mediaId: string, signal: "UP" | "DOWN") => {
    const next = signals[mediaId] === signal ? null : signal;
    setSignals((s) => {
      const copy = { ...s };
      if (next) copy[mediaId] = next;
      else delete copy[mediaId];
      return copy;
    });
    sendFeedback(mediaId, next);
  };

  const onHide = (mediaId: string) => {
    setHidden((h) => new Set(h).add(mediaId));
    sendFeedback(mediaId, "HIDE");
  };

  return (
    <Flex direction="column" gap="5">
      <Heading size="7">
        Welcome
        {me?.displayName
          ? `, ${me.displayName}`
          : me
            ? `, @${me.username}`
            : ""}
        .
      </Heading>

      <Flex gap="3" wrap="wrap">
        <Button onClick={() => navigate("/catalog")}>
          <BookSearchIcon size={16} aria-hidden />
          Browse catalog
        </Button>
        <Button
          variant="soft"
          onClick={() => navigate("/catalog/add")}
          color="green"
        >
          <PlusCircleIcon size={16} aria-hidden />
          Add media
        </Button>
        <Button variant="soft" onClick={() => navigate("/lists")}>
          <ListCheckIcon size={16} aria-hidden />
          Your lists
        </Button>
        <Button
          variant="soft"
          onClick={() => navigate("/following")}
          color="teal"
        >
          <UserCheckIcon size={16} aria-hidden />
          Following
        </Button>
      </Flex>

      {starred && starred.length > 0 && (
        <Flex direction="column" gap="3">
          <Flex gap="2" align="center">
            <Star size={18} aria-hidden className="dim-icon" />
            <Heading size="4">Starred lists</Heading>
          </Flex>
          <div className="media-grid">
            {starred.map((l) => (
              <Link
                key={l.id}
                to={`/lists/${l.id}`}
                className="media-card-link"
              >
                <Card asButton size="2">
                  <Flex direction="column" gap="1">
                    <Text weight="medium" truncate>
                      {l.title}
                    </Text>
                    <Text size="1" color="gray">
                      {l._count?.items ?? 0} items
                      {l.owner ? ` · by @${l.owner.username}` : ""}
                    </Text>
                  </Flex>
                </Card>
              </Link>
            ))}
          </div>
        </Flex>
      )}

      {(() => {
        const visibleRecs =
          recommendations?.filter((r) => !hidden.has(r.media.id)) ?? [];
        if (!recsLoading && visibleRecs.length === 0) return null;
        return (
          <Flex direction="column" gap="3">
            <Flex gap="2" align="center">
              <Sparkles size={18} aria-hidden className="dim-icon" />
              <Heading size="4">Recommended for you</Heading>
            </Flex>
            <div className="media-grid">
              {recsLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <RecCardSkeleton key={i} />
                  ))
                : visibleRecs.map((rec) => (
                    <RecCard
                      key={rec.media.id}
                      media={rec.media}
                      reason={rec.reason}
                      feedback={{
                        signal: signals[rec.media.id] ?? null,
                        onSignal: (s) => onSignal(rec.media.id, s),
                        onHide: () => onHide(rec.media.id),
                      }}
                    />
                  ))}
            </div>
          </Flex>
        );
      })()}

      <Flex direction="column" gap="3">
        <Flex gap="2" align="center">
          <Clock size={18} aria-hidden className="dim-icon" />
          <Heading size="4">Recent activity</Heading>
        </Flex>
        {activity && activity.length === 0 && (
          <Text color="gray">
            Nothing yet — find something in the catalog and log it.
          </Text>
        )}
        {activity?.map((item) => (
          <Card key={item.key} size="2">
            <Link to={`/media/${item.media.id}`}>
              <Flex justify="space-between" align="center" gap="3" wrap="wrap">
                <Flex gap="3" align="center">
                  <MediaTypeBadge
                    type={item.media.type}
                    linkToCatalog={false}
                  />
                  <Text weight="medium">{item.media.title}</Text>
                </Flex>
                <Flex gap="2" align="center">
                  {item.kind === "entry" && (
                    <StatusBadge status={item.status} />
                  )}
                  {item.kind === "episodes" && (
                    <Badge variant="soft" color="blue">
                      <Tv size={12} aria-hidden /> Watched {item.count} episode
                      {item.count === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {item.kind === "added" && (
                    <Badge variant="soft" color="teal">
                      <PlusCircle size={12} aria-hidden /> Added to catalog
                    </Badge>
                  )}
                  <Text size="1" color="gray" title={formatDate(item.at)}>
                    {timeAgo(item.at)}
                  </Text>
                </Flex>
              </Flex>
            </Link>
          </Card>
        ))}
      </Flex>
    </Flex>
  );
}
