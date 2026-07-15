import { Button, Flex } from "@wlcr/base-ic";

interface LoadMoreProps {
  /** Whether another page is available. When false, nothing renders. */
  hasMore: boolean;
  /** True while the next page is loading — disables the button. */
  loading: boolean;
  onLoadMore: () => void;
  label?: string;
}

/**
 * Centered "Load more" button for cursor-paginated lists. Pairs with the
 * `usePaginatedApi` hook: wire `hasMore`/`loadingMore`/`loadMore` straight in.
 * Renders nothing once the list is exhausted.
 */
export function LoadMore({
  hasMore,
  loading,
  onLoadMore,
  label = "Load more",
}: LoadMoreProps) {
  if (!hasMore) return null;
  return (
    <Flex justify="center" py="6">
      <Button
        variant="soft"
        onClick={onLoadMore}
        disabled={loading}
        size="4"
        style={{ minWidth: "330px" }}
      >
        {loading ? "Loading…" : label}
      </Button>
    </Flex>
  );
}
