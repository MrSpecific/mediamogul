import { Link } from "react-router-dom";
import { Card, Flex, Text, Badge } from "@wlcr/base-ic";
import { Check } from "lucide-react";
import { MediaTypeBadge } from "./MediaTypeBadge";
import { Cover } from "./Cover";
import type { MediaItem } from "../lib/types";

export function MediaCard({ item }: { item: MediaItem }) {
  return (
    <Link to={`/media/${item.id}`} className="media-card-link">
      <Card asButton size="2">
        <Flex direction="column" gap="2">
          <div className="media-card-cover">
            <Cover
              type={item.type}
              title={item.title}
              src={item.coverImageUrl}
            />
            {item.hasCompleted && (
              <Badge
                className="media-card-complete"
                title="Completed"
                radius="full"
                size="1"
                color="grass"
                variant="solid"
              >
                <Check size={12} strokeWidth={3} aria-hidden />
              </Badge>
            )}
          </div>
          <MediaTypeBadge type={item.type} />
          <Text weight="medium" size="2" truncate>
            {item.title}
          </Text>
        </Flex>
      </Card>
    </Link>
  );
}
