import { Link } from "react-router-dom";
import { Card, Flex, Text } from "@wlcr/base-ic";
import { Cover } from "./Cover";
import { ListFollowButton } from "./ListFollowButton";
import type { ListSummary } from "../lib/types";

/**
 * Compact list card for a user's profile: title, cover-thumbnail preview, item
 * count, and — for signed-in viewers looking at someone else's list — a
 * Follow (save) toggle. Mirrors the ListsPage row, trimmed for the profile.
 */
export function ProfileListCard({
  list,
  signedIn,
}: {
  list: ListSummary;
  signedIn: boolean;
}) {
  const items = list.items ?? [];
  const count = list._count?.items ?? 0;
  const extra = count - items.length;
  const canFollow = signedIn && !list.isOwner;

  return (
    <Card size="2">
      <Flex direction="column" gap="2">
        <Flex justify="space-between" align="start" gap="3">
          <Link to={`/lists/${list.id}`} className="media-card-link grow">
            <Flex direction="column" gap="1">
              <Text weight="medium">{list.title}</Text>
              {list.description && (
                <Text size="1" color="gray" truncate>
                  {list.description}
                </Text>
              )}
            </Flex>
          </Link>
          {canFollow && (
            <ListFollowButton listId={list.id} following={!!list.isSaved} />
          )}
        </Flex>

        <Link to={`/lists/${list.id}`} className="media-card-link">
          {items.length > 0 ? (
            <div className="list-preview-row">
              {items.map((it) => (
                <div className="list-preview-cover" key={it.id}>
                  <Cover
                    type={it.mediaItem.type}
                    title={it.mediaItem.title}
                    src={it.mediaItem.coverImageUrl}
                  />
                </div>
              ))}
              {extra > 0 && (
                <div className="list-preview-more">
                  <Text size="1" color="gray">
                    +{extra}
                  </Text>
                </div>
              )}
            </div>
          ) : (
            <Text size="1" color="gray">
              No items yet.
            </Text>
          )}
        </Link>

        <Text size="1" color="gray">
          {count} {count === 1 ? "item" : "items"}
        </Text>
      </Flex>
    </Card>
  );
}
