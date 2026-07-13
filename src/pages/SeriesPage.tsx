import { Link, useParams } from "react-router-dom";
import { Card, Flex, Heading, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { Cover } from "../components/Cover";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import type { MediaItem } from "../lib/types";

interface SeriesDetail {
  id: string;
  title: string;
  description: string | null;
  entries: { position: number; mediaItem: MediaItem }[];
}

export function SeriesPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useApiData<SeriesDetail>(id ? `/series/${id}` : null);

  if (!data) return <Text color="gray">Loading…</Text>;

  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="1">
        <Text size="1" color="gray">
          Series
        </Text>
        <Heading size="7">{data.title}</Heading>
        {data.description && <Text color="gray">{data.description}</Text>}
      </Flex>

      <Flex direction="column" gap="2">
        {data.entries.map(({ position, mediaItem }) => (
          <Link
            key={mediaItem.id}
            to={`/media/${mediaItem.id}`}
            className="media-card-link"
          >
            <Card asButton size="2">
              <Flex gap="3" align="center">
                <Text size="5" color="gray" style={{ width: 32, flex: "none" }}>
                  {position}
                </Text>
                <div style={{ width: 44, flex: "none" }}>
                  <Cover
                    type={mediaItem.type}
                    title={mediaItem.title}
                    src={mediaItem.coverImageUrl}
                  />
                </div>
                <Flex direction="column" gap="1" className="shrink">
                  <MediaTypeBadge type={mediaItem.type} />
                  <Text weight="medium" truncate>
                    {mediaItem.title}
                  </Text>
                  {mediaItem.subtitle && (
                    <Text size="1" color="gray" truncate>
                      {mediaItem.subtitle}
                    </Text>
                  )}
                </Flex>
              </Flex>
            </Card>
          </Link>
        ))}
      </Flex>
    </Flex>
  );
}
