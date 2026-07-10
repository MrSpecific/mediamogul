import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Flex, Heading, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate, timeAgo } from "../lib/time";
import type { MediaEntry, Profile } from "../lib/types";

export function HomePage() {
  const navigate = useNavigate();
  const { data: me } = useApiData<Profile>("/me");
  const { data: entries } = useApiData<MediaEntry[]>("/me/entries");

  return (
    <Flex direction="column" gap="5">
      <Heading size="7">
        Welcome
        {me?.displayName ? `, ${me.displayName}` : me ? `, @${me.username}` : ""}.
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

      <Flex direction="column" gap="3">
        <Heading size="4">Recent activity</Heading>
        {entries && entries.length === 0 && (
          <Text color="gray">
            Nothing logged yet — find something in the catalog and log it.
          </Text>
        )}
        {entries?.map((e) => {
          const when = e.finishedAt ?? e.startedAt;
          return (
            <Card key={e.id} size="2">
              <Link to={`/media/${e.mediaItem?.id}`} className="media-card-link">
                <Flex
                  justify="space-between"
                  align="center"
                  gap="3"
                  wrap="wrap"
                >
                  <Flex gap="3" align="center">
                    {e.mediaItem && <MediaTypeBadge type={e.mediaItem.type} />}
                    <Text weight="medium">
                      {e.mediaItem?.title ?? "Unknown"}
                    </Text>
                  </Flex>
                  <Flex gap="2" align="center">
                    <StatusBadge status={e.status} />
                    {when && (
                      <Text size="1" color="gray" title={formatDate(when)}>
                        {timeAgo(when)}
                      </Text>
                    )}
                  </Flex>
                </Flex>
              </Link>
            </Card>
          );
        })}
      </Flex>
    </Flex>
  );
}
