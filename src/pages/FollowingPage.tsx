import { Link } from "react-router-dom";
import { Avatar, Badge, Card, Flex, Heading, Text } from "@wlcr/base-ic";
import { PenLine, Tv } from "lucide-react";
import { useApiData, usePaginatedApi } from "../lib/hooks";
import { LoadMore } from "../components/LoadMore";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { StatusBadge } from "../components/StatusBadge";
import { StarRating } from "../components/StarRating";
import { formatDate, timeAgo } from "../lib/time";
import { getInitials } from "../lib/initials";
import type {
  FeedActor,
  FollowingActivityItem,
  UserSummary,
} from "../lib/types";

/** Compact roster of the people the viewer follows. */
function FollowingList({ users }: { users: UserSummary[] }) {
  return (
    <Card size="2">
      <Flex direction="column" gap="2">
        <Text weight="medium">People you follow</Text>
        <Flex gap="3" wrap="wrap">
          {users.map((u) => (
            <Link
              key={u.id}
              to={`/u/${u.username}`}
              className="byline-link"
            >
              <Flex gap="2" align="center">
                <Avatar
                  size="1"
                  src={u.avatarUrl ?? undefined}
                  fallback={getInitials(u.displayName ?? u.username)}
                />
                <Text size="2">{u.displayName ?? `@${u.username}`}</Text>
              </Flex>
            </Link>
          ))}
        </Flex>
      </Flex>
    </Card>
  );
}

function Actor({ actor }: { actor: FeedActor }) {
  return (
    <Flex gap="2" align="center">
      <Avatar
        size="1"
        src={actor.avatarUrl ?? undefined}
        fallback={getInitials(actor.displayName ?? actor.username)}
      />
      <Link to={`/u/${actor.username}`} className="byline-link">
        <Text weight="medium">{actor.displayName ?? `@${actor.username}`}</Text>
      </Link>
    </Flex>
  );
}

/** The verb phrase for a feed row, e.g. "reviewed" / "rated" / "watched". */
function actionLabel(item: FollowingActivityItem): string {
  switch (item.kind) {
    case "review":
      return "reviewed";
    case "rating":
      return "rated";
    case "episodes":
      return `watched ${item.count} episode${item.count === 1 ? "" : "s"} of`;
    case "entry":
      return "updated";
  }
}

export function FollowingPage() {
  const { items, loading, loadingMore, hasMore, loadMore } =
    usePaginatedApi<FollowingActivityItem>("/me/following-activity");
  const { data: following } = useApiData<UserSummary[]>("/me/following");

  return (
    <Flex direction="column" gap="4">
      <Heading size="7">Following</Heading>
      <Text color="gray">
        Activity from people you follow. Everyone you follow shows their public
        reviews; people who follow you back also show what they rate and watch.
      </Text>

      {following && following.length > 0 && <FollowingList users={following} />}

      {!loading && items.length === 0 ? (
        <Text color="gray">
          Nothing here yet. Follow some people and their activity will show up.
        </Text>
      ) : (
        <Flex direction="column" gap="3">
          {items.map((item) => (
            <Card key={item.key} size="2">
              <Flex direction="column" gap="2">
                <Flex justify="space-between" align="center" gap="3" wrap="wrap">
                  <Flex gap="2" align="center" wrap="wrap">
                    <Actor actor={item.actor} />
                    <Text size="2" color="gray">
                      {actionLabel(item)}
                    </Text>
                    <MediaTypeBadge type={item.media.type} />
                    <Link
                      to={`/media/${item.media.id}`}
                      className="byline-link"
                    >
                      <Text weight="medium">{item.media.title}</Text>
                    </Link>
                  </Flex>
                  <Text size="1" color="gray" title={formatDate(item.at)}>
                    {timeAgo(item.at)}
                  </Text>
                </Flex>

                {item.kind === "rating" && (
                  <StarRating value={item.stars} size={16} />
                )}

                {item.kind === "entry" && <StatusBadge status={item.status} />}

                {item.kind === "episodes" && (
                  <Badge variant="soft" color="blue">
                    <Tv size={12} aria-hidden /> {item.count} episode
                    {item.count === 1 ? "" : "s"}
                  </Badge>
                )}

                {item.kind === "review" && (
                  <Flex direction="column" gap="1">
                    {item.title && <Text weight="medium">{item.title}</Text>}
                    {item.containsSpoilers ? (
                      <Badge variant="soft" color="amber">
                        <PenLine size={12} aria-hidden /> Review contains
                        spoilers
                      </Badge>
                    ) : (
                      <Text color="gray" className="feed-review-body">
                        {item.body}
                      </Text>
                    )}
                  </Flex>
                )}
              </Flex>
            </Card>
          ))}
          <LoadMore
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
          />
        </Flex>
      )}
    </Flex>
  );
}
