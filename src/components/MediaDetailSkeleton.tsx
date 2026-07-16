import { Flex, Skeleton } from "@wlcr/base-ic";

/** Loading placeholder for the media detail page — mirrors the header (cover +
 *  title/meta) and the first content blocks so the page doesn't pop in. */
export function MediaDetailSkeleton() {
  return (
    <Flex direction="column" gap="5">
      <Flex gap="5" wrap="wrap">
        {/* Cover */}
        <Skeleton
          className="detail-cover"
          radius="large"
          style={{ aspectRatio: "2 / 3" }}
        />

        {/* Title + meta column */}
        <Flex direction="column" gap="3" style={{ flex: 1, minWidth: 260 }}>
          <Skeleton width="70%" height={34} />
          <Skeleton width="40%" height={18} />
          <Flex gap="2" wrap="wrap">
            <Skeleton width={70} height={22} radius="full" />
            <Skeleton width={90} height={22} radius="full" />
            <Skeleton width={60} height={22} radius="full" />
          </Flex>
          <Skeleton width="100%" height={14} />
          <Skeleton width="95%" height={14} />
          <Skeleton width="80%" height={14} />
          <Flex gap="2" wrap="wrap" style={{ marginTop: 4 }}>
            <Skeleton width={130} height={36} radius="medium" />
            <Skeleton width={130} height={36} radius="medium" />
          </Flex>
        </Flex>
      </Flex>

      {/* "Your rating" / section block */}
      <Flex direction="column" gap="3">
        <Skeleton width={140} height={24} />
        <Skeleton width={200} height={30} />
      </Flex>
    </Flex>
  );
}
