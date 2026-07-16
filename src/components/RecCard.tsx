import { Link } from "react-router-dom";
import { Card, Flex, Skeleton, Text } from "@wlcr/base-ic";
import { MediaTypeBadge } from "./MediaTypeBadge";
import { Cover } from "./Cover";
import type { Recommendation } from "../lib/types";

/** A media card for recommendation grids — like MediaCard, plus the reason
 *  the item was surfaced ("Because you liked …" / "Liked by @…"). */
export function RecCard({ media, reason }: Recommendation) {
  return (
    <Link to={`/media/${media.id}`} className="media-card-link">
      <Card asButton size="2">
        <Flex direction="column" gap="2">
          <div className="media-card-cover">
            <Cover type={media.type} title={media.title} src={media.coverImageUrl} />
          </div>
          <MediaTypeBadge type={media.type} />
          <Text weight="medium" size="2" truncate>
            {media.title}
          </Text>
          <Text size="1" color="gray" truncate title={reason}>
            {reason}
          </Text>
        </Flex>
      </Card>
    </Link>
  );
}

/** Placeholder card matching RecCard's footprint, so a loading rec grid holds
 *  its layout instead of shifting when data arrives. */
export function RecCardSkeleton() {
  return (
    <Card size="2">
      <Flex direction="column" gap="2">
        <Skeleton
          width="100%"
          radius="medium"
          style={{ aspectRatio: "2 / 3" }}
        />
        <Skeleton width={56} height={18} radius="full" />
        <Skeleton width="85%" height={15} />
        <Skeleton width="55%" height={12} />
      </Flex>
    </Card>
  );
}
