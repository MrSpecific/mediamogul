import { useEffect, useState } from "react";
import { Button, Card, Field, Flex, Heading, Input, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { apiGet, apiSend, ApiError } from "../lib/api";
import type { Profile } from "../lib/types";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
type Remote = "checking" | "available" | "taken" | null;

/** Username editor. Username is the app-specific @handle others use to find and
 *  invite you; display name and avatar are managed in Neon Auth account
 *  settings, so they're intentionally not duplicated here. */
export function ProfileSettings() {
  const { data: me, reload } = useApiData<Profile>("/me");
  // Key on the loaded profile so the form seeds from props (no seeding effect).
  if (!me) return null;
  return <UsernameForm key={me.id} me={me} onSaved={reload} />;
}

function UsernameForm({ me, onSaved }: { me: Profile; onSaved: () => void }) {
  const [username, setUsername] = useState(me.username);
  const [remote, setRemote] = useState<Remote>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const trimmed = username.trim();
  const changed = trimmed !== me.username;
  const formatOk = USERNAME_RE.test(trimmed);
  const needsRemote = changed && formatOk;

  // Debounced availability check. All state writes are inside the timeout, so
  // nothing runs synchronously in the effect body.
  useEffect(() => {
    if (!needsRemote) return;
    const t = setTimeout(() => {
      setRemote("checking");
      apiGet<{ available: boolean }>(
        `/me/username-available?username=${encodeURIComponent(trimmed)}`,
      )
        .then((r) => setRemote(r.available ? "available" : "taken"))
        .catch(() => setRemote(null));
    }, 400);
    return () => clearTimeout(t);
  }, [trimmed, needsRemote]);

  const status: "idle" | "invalid" | Remote = !changed
    ? "idle"
    : !formatOk
      ? "invalid"
      : (remote ?? "checking");
  const blocked =
    status === "checking" || status === "taken" || status === "invalid";

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiSend("PATCH", "/me", { username: trimmed });
      setMsg("Username saved.");
      onSaved();
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "failed";
      setMsg(
        code === "username_taken"
          ? "That username is taken."
          : "Couldn't save your username.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card size="3">
      <Flex direction="column" gap="3">
        <Flex direction="column" gap="1">
          <Heading size="4">Username</Heading>
          <Text size="2" color="gray">
            Your unique @handle — how others find and invite you to shared
            lists. Your display name and avatar live in your account settings.
          </Text>
        </Flex>

        <Field
          label="Username"
          description="3–30 characters: lowercase letters, numbers, and underscores."
        >
          <Input
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value.toLowerCase())}
            placeholder="username"
          />
        </Field>

        {status === "checking" && (
          <Text size="1" color="gray">
            Checking availability…
          </Text>
        )}
        {status === "available" && (
          <Text size="1" color="green">
            @{trimmed} is available.
          </Text>
        )}
        {status === "taken" && (
          <Text size="1" color="red">
            That username is taken.
          </Text>
        )}
        {status === "invalid" && (
          <Text size="1" color="red">
            Use 3–30 lowercase letters, numbers, or underscores.
          </Text>
        )}

        <Flex gap="3" align="center">
          <Button
            onClick={() => void save()}
            loading={saving}
            disabled={!changed || blocked || !trimmed}
          >
            Save username
          </Button>
          {msg && (
            <Text size="2" color="gray">
              {msg}
            </Text>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}
