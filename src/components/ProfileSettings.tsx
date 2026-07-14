import { useEffect, useState } from "react";
import { Button, Field, Flex, Heading, Input, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { apiGet, apiSend, ApiError } from "../lib/api";
import type { Profile } from "../lib/types";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
type Remote = "checking" | "available" | "taken" | null;

/** Profile editor: set/change username (with live availability check) and
 *  display name. Username is how others find and invite you. */
export function ProfileSettings() {
  const { data: me, reload } = useApiData<Profile>("/me");
  // Key on the loaded profile so the form seeds its initial state from props
  // (no seeding effect needed).
  if (!me) return null;
  return <ProfileForm key={me.id} me={me} onSaved={reload} />;
}

function ProfileForm({ me, onSaved }: { me: Profile; onSaved: () => void }) {
  const [username, setUsername] = useState(me.username);
  const [displayName, setDisplayName] = useState(me.displayName ?? "");
  const [remote, setRemote] = useState<Remote>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const trimmed = username.trim();
  const changed = trimmed !== me.username;
  const formatOk = USERNAME_RE.test(trimmed);
  const needsRemote = changed && formatOk;

  // Debounced availability check. All state writes happen inside the timeout,
  // so nothing runs synchronously in the effect body.
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

  // Displayed username status, derived from render — no effect needed.
  const status: "idle" | "invalid" | Remote = !changed
    ? "idle"
    : !formatOk
      ? "invalid"
      : (remote ?? "checking");

  const dirty = changed || displayName.trim() !== (me.displayName ?? "");
  const blocked = status === "checking" || status === "taken" || status === "invalid";

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiSend("PATCH", "/me", {
        username: trimmed,
        displayName: displayName.trim() || null,
      });
      setMsg("Profile saved.");
      onSaved();
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "failed";
      setMsg(
        code === "username_taken"
          ? "That username is taken."
          : "Couldn't save your profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flex direction="column" gap="3">
      <Heading size="4">Profile</Heading>
      <Field
        label="Username"
        description="How others find and invite you. 3–30 characters: lowercase letters, numbers, and underscores."
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

      <Field label="Display name">
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
          placeholder="Your name (optional)"
        />
      </Field>

      <Flex gap="3" align="center">
        <Button
          onClick={() => void save()}
          loading={saving}
          disabled={!dirty || blocked || !trimmed}
        >
          Save profile
        </Button>
        {msg && (
          <Text size="2" color="gray">
            {msg}
          </Text>
        )}
      </Flex>
    </Flex>
  );
}
