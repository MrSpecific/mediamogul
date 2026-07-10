import { useParams } from "react-router-dom";
import { Avatar, Button, Flex, Heading, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import type { Profile } from "../lib/types";

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { data, reload } = useApiData<Profile>(
    username ? `/users/${username}` : null,
  );

  if (!data) return <Text color="gray">Loading…</Text>;

  const toggleFollow = async () => {
    await apiSend(
      data.isFollowing ? "DELETE" : "PUT",
      `/users/${username}/follow`,
    );
    reload();
  };

  return (
    <Flex direction="column" gap="4">
      <Flex gap="4" align="center" wrap="wrap">
        <Avatar
          size="5"
          src={data.avatarUrl ?? undefined}
          fallback={(data.displayName ?? data.username).slice(0, 2).toUpperCase()}
        />
        <Flex direction="column" gap="1">
          <Heading size="7">{data.displayName ?? data.username}</Heading>
          <Text color="gray">@{data.username}</Text>
        </Flex>
        {typeof data.isFollowing === "boolean" && (
          <Button
            variant={data.isFollowing ? "soft" : "solid"}
            onClick={() => void toggleFollow()}
          >
            {data.isFollowing ? "Following" : "Follow"}
          </Button>
        )}
      </Flex>

      {data.bio && <Text>{data.bio}</Text>}

      {data._count && (
        <Flex gap="4" wrap="wrap">
          <Text size="2" color="gray">
            {data._count.followers} followers
          </Text>
          <Text size="2" color="gray">
            {data._count.following} following
          </Text>
          <Text size="2" color="gray">
            {data._count.entries} logged
          </Text>
          <Text size="2" color="gray">
            {data._count.lists} lists
          </Text>
        </Flex>
      )}
    </Flex>
  );
}
