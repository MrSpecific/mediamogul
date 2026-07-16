import { Link } from "react-router-dom";
import { Card, Flex, Skeleton, Text, Tooltip } from "@wlcr/base-ic";
import { ThumbsDown, ThumbsUp, X } from "lucide-react";
import { MediaTypeBadge } from "./MediaTypeBadge";
import { Cover } from "./Cover";
import type { Recommendation } from "../lib/types";

/** Feedback controls, wired only where a rec can be tuned (the home feed). */
export interface RecFeedback {
  signal: "UP" | "DOWN" | null;
  onSignal: (signal: "UP" | "DOWN") => void;
  onHide: () => void;
}

/** A media card for recommendation grids — like MediaCard, plus the reason the
 *  item was surfaced and (optionally) thumbs-up / thumbs-down / hide controls. */
export function RecCard({
  media,
  reason,
  feedback,
}: Recommendation & { feedback?: RecFeedback }) {
  // Buttons live inside the card's <Link>, so suppress navigation on click.
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <div className="rec-card">
      <Link to={`/media/${media.id}`} className="media-card-link">
        <Card asButton size="2">
          <Flex direction="column" gap="2">
            <div className="media-card-cover">
              <Cover
                type={media.type}
                title={media.title}
                src={media.coverImageUrl}
              />
            </div>
            <MediaTypeBadge type={media.type} linkToCatalog={false} />
            <Text weight="medium" size="2" truncate>
              {media.title}
            </Text>
            <Tooltip content={reason}>
              <Text size="1" color="gray" truncate>
                {reason}
              </Text>
            </Tooltip>
          </Flex>
        </Card>
      </Link>
      {feedback && (
        <div className="rec-card-actions">
          <button
            type="button"
            className="rec-action"
            data-active={feedback.signal === "UP"}
            aria-label="More like this"
            title="More like this"
            onClick={act(() => feedback.onSignal("UP"))}
          >
            <ThumbsUp size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="rec-action"
            data-active={feedback.signal === "DOWN"}
            aria-label="Not for me"
            title="Not for me"
            onClick={act(() => feedback.onSignal("DOWN"))}
          >
            <ThumbsDown size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="rec-action"
            aria-label="Hide"
            title="Hide"
            onClick={act(feedback.onHide)}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
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
