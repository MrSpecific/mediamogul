import { Link, useParams } from "react-router-dom";
import { Flex, Heading, Text } from "@wlcr/base-ic";
import { ArrowLeft } from "lucide-react";
import { useApiData, usePaginatedApi } from "../lib/hooks";
import { LoadMore } from "../components/LoadMore";
import { RecCard, RecCardSkeleton } from "../components/RecCard";
import type { MediaDetail, Recommendation } from "../lib/types";

/** Full, paginated "More like this" list for a single media item. */
export function SimilarPage() {
  const { id } = useParams<{ id: string }>();
  const { data: media } = useApiData<MediaDetail>(id ? `/media/${id}` : null);
  const { items, loading, loadingMore, hasMore, loadMore } =
    usePaginatedApi<Recommendation>(id ? `/media/${id}/similar` : null);

  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="1">
        <Link to={id ? `/media/${id}` : "/"} className="byline-link">
          <Text size="1" color="gray">
            <ArrowLeft size={12} aria-hidden /> Back
            {media ? ` to ${media.title}` : ""}
          </Text>
        </Link>
        <Heading size="7">More like {media?.title ?? "this"}</Heading>
      </Flex>

      {!loading && items.length === 0 ? (
        <Text color="gray">No similar titles found.</Text>
      ) : (
        <>
          <div className="media-grid">
            {loading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <RecCardSkeleton key={i} />
                ))
              : items.map((rec) => (
                  <RecCard
                    key={rec.media.id}
                    media={rec.media}
                    reason={rec.reason}
                  />
                ))}
          </div>
          <LoadMore
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
          />
        </>
      )}
    </Flex>
  );
}
