import { Link } from "react-router-dom";
import { Card, Flex, Text, Badge } from "@wlcr/base-ic";
import { Check } from "lucide-react";
import { MediaTypeBadge } from "./MediaTypeBadge";
import { StarRating } from "./StarRating";
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
          <MediaTypeBadge type={item.type} linkToCatalog={false} />
          <Text weight="medium" size="2" truncate>
            {item.title}
          </Text>
          {/* Rating row. Only rendered where the field is present (catalog
              results). When an item has no ratings yet we still render a dimmed
              placeholder so every card is the same height. */}
          {item.averageRating !== undefined &&
            (item.averageRating != null ? (
              <Flex
                gap="1"
                align="center"
                title={`${item.averageRating.toFixed(1)} from ${item.ratingCount} rating${item.ratingCount === 1 ? "" : "s"}`}
              >
                <StarRating value={item.averageRating} size={13} />
                {item.ratingCount ? (
                  <Text size="1" color="gray">
                    {item.ratingCount}
                  </Text>
                ) : null}
              </Flex>
            ) : (
              <Flex gap="1" align="center" title="No ratings yet">
                <span style={{ opacity: 0.3, display: "inline-flex" }}>
                  <StarRating value={null} size={13} />
                </span>
                <Text size="1" color="gray">
                  No ratings
                </Text>
              </Flex>
            ))}
        </Flex>
      </Card>
    </Link>
  );
}
