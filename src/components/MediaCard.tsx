import { Link } from "react-router-dom";
import { Badge, Card, Flex, Text } from "@wlcr/base-ic";
import { mediaTypeLabel, type MediaItem } from "../lib/types";

export function MediaCard({ item }: { item: MediaItem }) {
  return (
    <Link to={`/media/${item.id}`} className="media-card-link">
      <Card asButton size="2">
        <Flex direction="column" gap="2">
          <div className="cover">
            {item.coverImageUrl ? (
              <img src={item.coverImageUrl} alt="" loading="lazy" />
            ) : (
              <div className="cover-fallback" />
            )}
          </div>
          <Badge size="1" variant="soft">
            {mediaTypeLabel(item.type)}
          </Badge>
          <Text weight="medium" size="2" truncate>
            {item.title}
          </Text>
        </Flex>
      </Card>
    </Link>
  );
}
