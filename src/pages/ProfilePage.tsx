import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar, Badge, Button, Card, Flex, Heading, Text } from "@wlcr/base-ic";
import { authClient } from "../auth";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { trackEvent } from "../lib/analytics";
import { getInitials } from "../lib/initials";
import { AdminUserControls } from "../components/AdminUserControls";
import { ProfileListCard } from "../components/ProfileListCard";
import {
  FollowRosterDialog,
  type RosterMode,
} from "../components/FollowRosterDialog";
import type { ListSummary, Profile } from "../lib/types";

/**
 * A user profile. Renders one of several variants based on the viewer:
 *   - public / signed-out: identity, bio, and public counts (fetched from the
 *     unauthenticated endpoint; only public profiles resolve).
 *   - other signed-in user: adds the Follow button.
 *   - owner: adds an "Edit profile" affordance and shows the private badge.
 *   - admin (non-owner): adds the admin management panel.
 */
export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session);

  // Signed-in viewers hit the authed endpoint (viewer context + follow state);
  // logged-out visitors hit the public endpoint (public profiles only).
  const path =
    username && !isPending
      ? signedIn
        ? `/users/${username}`
        : `/public/users/${username}`
      : null;
  const { data, error, reload } = useApiData<Profile>(path);
  const listsPath =
    username && !isPending
      ? signedIn
        ? `/users/${username}/lists`
        : `/public/users/${username}/lists`
      : null;
  const { data: lists } = useApiData<ListSummary[]>(listsPath);

  // Which roster dialog (followers / following) is open, if any.
  const [roster, setRoster] = useState<RosterMode | null>(null);

  if (error === "private") {
    return (
      <Card size="3">
        <Flex direction="column" gap="2">
          <Heading size="5">This profile is private</Heading>
          <Text color="gray">@{username} has chosen not to make their profile public.</Text>
        </Flex>
      </Card>
    );
  }
  if (error === "not_found") {
    return (
      <Card size="3">
        <Flex direction="column" gap="2">
          <Heading size="5">Profile not found</Heading>
          <Text color="gray">No user exists at @{username}.</Text>
        </Flex>
      </Card>
    );
  }
  if (!data) return <Text color="gray">Loading…</Text>;

  const viewer = data.viewer;
  const toggleFollow = async () => {
    const following = data.isFollowing;
    await apiSend(following ? "DELETE" : "PUT", `/users/${username}/follow`);
    if (!following) trackEvent("user_followed");
    reload();
  };

  return (
    <Flex direction="column" gap="4">
      <Flex gap="4" align="center" wrap="wrap">
        <Avatar
          size="5"
          src={data.avatarUrl ?? undefined}
          fallback={getInitials(data.displayName ?? data.username)}
        />
        <Flex direction="column" gap="1">
          <Flex gap="2" align="center" wrap="wrap">
            <Heading size="7">{data.displayName ?? data.username}</Heading>
            {data.deactivatedAt && <Badge color="red">Deactivated</Badge>}
            {data.profilePublic === false && <Badge color="gray">Private</Badge>}
          </Flex>
          <Text color="gray">@{data.username}</Text>
        </Flex>

        {/* Owner: edit affordance. Other signed-in users: follow. */}
        {viewer?.isOwner ? (
          <Button variant="soft" onClick={() => navigate("/settings/profile")}>
            Edit profile
          </Button>
        ) : (
          viewer?.canFollow &&
          typeof data.isFollowing === "boolean" && (
            <Button
              variant={data.isFollowing ? "soft" : "solid"}
              onClick={() => void toggleFollow()}
            >
              {data.isFollowing ? "Following" : "Follow"}
            </Button>
          )
        )}
      </Flex>

      {data.bio && <Text>{data.bio}</Text>}

      {data._count && (
        <Flex gap="4" wrap="wrap">
          <button
            type="button"
            className="link-button"
            onClick={() => setRoster("followers")}
          >
            <Text size="2" color="gray">
              {data._count.followers} followers
            </Text>
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => setRoster("following")}
          >
            <Text size="2" color="gray">
              {data._count.following} following
            </Text>
          </button>
          <Text size="2" color="gray">{data._count.entries} logged</Text>
          <Text size="2" color="gray">{data._count.lists} lists</Text>
        </Flex>
      )}

      {lists && lists.length > 0 && (
        <Flex direction="column" gap="3">
          <Heading size="4">Public lists</Heading>
          {lists.map((l) => (
            <ProfileListCard key={l.id} list={l} signedIn={signedIn} />
          ))}
        </Flex>
      )}

      {/* Admin management — only when an admin views someone else's profile. */}
      {viewer?.isAdmin && !viewer.isOwner && <AdminUserControls userId={data.id} />}

      {username && (
        <FollowRosterDialog
          open={roster !== null}
          onOpenChange={(open) => !open && setRoster(null)}
          username={username}
          mode={roster ?? "followers"}
          signedIn={signedIn}
        />
      )}
    </Flex>
  );
}
