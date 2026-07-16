import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, Flex, Heading, Text } from "@wlcr/base-ic";
import { PlusCircle, Star, Tv } from "lucide-react";
import { useApiData } from "../lib/hooks";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate, timeAgo } from "../lib/time";
import type { ActivityItem, ListSummary, Profile } from "../lib/types";

export function HomePage() {
  const navigate = useNavigate();
  const { data: me } = useApiData<Profile>("/me");
  const { data: activity } = useApiData<ActivityItem[]>("/me/activity");
  const { data: starred } = useApiData<ListSummary[]>("/me/starred");

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
        <Button onClick={() => navigate("/catalog")}>Browse catalog</Button>
        <Button variant="soft" onClick={() => navigate("/catalog/add")}>
          Add media
        </Button>
        <Button variant="soft" onClick={() => navigate("/lists")}>
          Your lists
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

      <Flex direction="column" gap="3">
        <Heading size="4">Recent activity</Heading>
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
                  <MediaTypeBadge type={item.media.type} />
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
