import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, Button, Dialog, Flex, Text } from "@wlcr/base-ic";
import { usePaginatedApi } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { getInitials } from "../lib/initials";
import { LoadMore } from "./LoadMore";
import type { UserSummary } from "../lib/types";

export type RosterMode = "followers" | "following";

const TITLES: Record<RosterMode, string> = {
  followers: "Followers",
  following: "Following",
};

/** One user in the roster: avatar, name, and (for other signed-in users) a
 *  Follow toggle. Local optimistic state so the button reacts immediately. */
function UserRow({
  user,
  signedIn,
  onNavigate,
}: {
  user: UserSummary;
  signedIn: boolean;
  onNavigate: () => void;
}) {
  const [following, setFollowing] = useState(!!user.isFollowing);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const next = !following;
    setBusy(true);
    try {
      await apiSend(next ? "PUT" : "DELETE", `/users/${user.username}/follow`);
      setFollowing(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex align="center" justify="space-between" gap="3">
      <Link
        to={`/u/${user.username}`}
        className="media-card-link"
        onClick={onNavigate}
      >
        <Flex align="center" gap="2">
          <Avatar
            size="2"
            src={user.avatarUrl ?? undefined}
            fallback={getInitials(user.displayName ?? user.username)}
          />
          <Flex direction="column">
            <Text weight="medium" size="2">
              {user.displayName ?? user.username}
            </Text>
            <Text size="1" color="gray">
              @{user.username}
            </Text>
          </Flex>
        </Flex>
      </Link>
      {signedIn && !user.isSelf && (
        <Button
          size="1"
          variant={following ? "soft" : "solid"}
          color={following ? "gray" : undefined}
          loading={busy}
          onClick={() => void toggle()}
          aria-pressed={following}
        >
          {following ? "Following" : "Follow"}
        </Button>
      )}
    </Flex>
  );
}

/**
 * Modal roster of a user's followers or the accounts they follow. Fetches the
 * authed endpoint when signed in (so rows carry the viewer's follow-state and
 * a working Follow button) and the public endpoint otherwise. Data loads lazily
 * — only once the dialog is opened.
 */
export function FollowRosterDialog({
  open,
  onOpenChange,
  username,
  mode,
  signedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  mode: RosterMode;
  signedIn: boolean;
}) {
  const base = signedIn ? "" : "/public";
  const { items, loading, loadingMore, hasMore, loadMore } =
    usePaginatedApi<UserSummary>(open ? `${base}/users/${username}/${mode}` : null);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={TITLES[mode]}
      content={
        <Flex direction="column" gap="3">
          {loading && items.length === 0 && (
            <Text color="gray" size="2">
              Loading…
            </Text>
          )}
          {!loading && items.length === 0 && (
            <Text color="gray" size="2">
              {mode === "followers"
                ? "No followers yet."
                : "Not following anyone yet."}
            </Text>
          )}
          {items.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              signedIn={signedIn}
              onNavigate={() => onOpenChange(false)}
            />
          ))}
          <LoadMore
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
          />
        </Flex>
      }
    >
      {/* Controlled via `open`; the trigger is required by the API but unused.
          Must be a real <button> — Base UI's Trigger expects native button
          semantics. */}
      <button type="button" style={{ display: "none" }} aria-hidden />
    </Dialog>
  );
}
