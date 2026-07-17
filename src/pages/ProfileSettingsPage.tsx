import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Flex,
  Heading,
  Select,
  Text,
} from "@wlcr/base-ic";
import { authClient } from "../auth";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { getInitials } from "../lib/initials";
import { ProfileSettings } from "../components/ProfileSettings";
import type { Profile } from "../lib/types";

/**
 * Account & profile settings — deliberately separate from Plans & billing.
 *   - Account: name / email / login provider (managed by Neon Auth; surfaced
 *     here with a link into the account manager).
 *   - Username: the app @handle (see ProfileSettings).
 *   - Visibility: whether the profile is public to logged-out visitors.
 */
export function ProfileSettingsPage() {
  return (
    <Flex direction="column" gap="5">
      <Heading size="7">Profile &amp; account</Heading>
      <AccountCard />
      <ProfileSettings />
      <ProfileVisibilityCard />
    </Flex>
  );
}

/** Name / email / login provider, from Neon Auth. */
function AccountCard() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  return (
    <Card size="3">
      <Flex direction="column" gap="3">
        <Flex direction="column" gap="1">
          <Heading size="4">Account</Heading>
          <Text size="2" color="gray">
            Your name, email, and sign-in methods are managed by your account
            provider.
          </Text>
        </Flex>

        <Flex gap="3" align="center" wrap="wrap">
          <Avatar
            size="4"
            src={user?.image ?? undefined}
            fallback={getInitials(user?.name ?? user?.email)}
          />
          <Flex direction="column" gap="1">
            <Text weight="bold">{user?.name ?? "—"}</Text>
            <Flex gap="2" align="center" wrap="wrap">
              <Text size="2" color="gray">{user?.email ?? "—"}</Text>
              {user?.emailVerified && <Badge color="green" variant="soft">Verified</Badge>}
            </Flex>
          </Flex>
        </Flex>

        <Flex gap="2" wrap="wrap">
          <Button variant="soft" onClick={() => navigate("/account/settings")}>
            Manage name &amp; email
          </Button>
          <Button variant="soft" onClick={() => navigate("/account/security")}>
            Sign-in &amp; providers
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

/** Public/private profile visibility toggle (app-owned setting). */
function ProfileVisibilityCard() {
  const { data: me, reload } = useApiData<Profile>("/me");

  const setPublic = async (isPublic: boolean) => {
    await apiSend("PATCH", "/me", { profilePublic: isPublic });
    reload();
  };

  const value = me?.profilePublic === false ? "private" : "public";

  return (
    <Card size="3">
      <Flex direction="column" gap="3">
        <Flex direction="column" gap="1">
          <Heading size="4">Profile visibility</Heading>
          <Text size="2" color="gray">
            Public profiles can be viewed by anyone, including logged-out
            visitors, at mediamogul.app/u/{me?.username ?? "you"}. Private
            profiles are visible only to you (and site admins).
          </Text>
        </Flex>
        <Flex align="center" gap="3">
          <Select
            value={value}
            onValueChange={(v) => void setPublic(v === "public")}
            disabled={!me}
          >
            <Select.Item value="public">Public</Select.Item>
            <Select.Item value="private">Private</Select.Item>
          </Select>
          {me && (
            <Badge color={value === "public" ? "green" : "gray"} variant="soft">
              {value === "public" ? "Visible to everyone" : "Only you"}
            </Badge>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}
