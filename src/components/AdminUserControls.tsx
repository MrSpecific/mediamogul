import { useState } from "react";
import { Badge, Button, Card, Flex, Heading, Select, Text } from "@wlcr/base-ic";
import { apiSend, ApiError } from "../lib/api";
import { useApiData } from "../lib/hooks";
import type { AdminUserDetail, AppRole, SubscriptionTier } from "../lib/types";

const ROLE_OPTIONS: { value: AppRole | "DEFAULT"; label: string }[] = [
  { value: "DEFAULT", label: "Default (from login)" },
  { value: "USER", label: "User" },
  { value: "CONTRIBUTOR", label: "Contributor" },
  { value: "EDITOR", label: "Editor" },
  { value: "ADMIN", label: "Admin" },
];

const TIER_OPTIONS: SubscriptionTier[] = ["FREE", "STANDARD"];

function fmt(ts: string | null | undefined): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

/**
 * Admin management panel for a single user. Fetches the full admin detail
 * (auth email/signup + audit trail) and lets an admin change tier, set a role
 * override, and deactivate/reactivate the account. Reused by the admin profile
 * variant and could be embedded elsewhere.
 */
export function AdminUserControls({ userId }: { userId: string }) {
  const { data, reload } = useApiData<AdminUserDetail>(`/admin/users/${userId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await apiSend("PATCH", `/admin/users/${userId}`, body);
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isDeactivated = data.deactivatedAt !== null;

  return (
    <Card size="3" style={{ borderColor: "var(--red-6)" }}>
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center" gap="2" wrap="wrap">
          <Heading size="4">Admin controls</Heading>
          {isDeactivated && <Badge color="red">Deactivated</Badge>}
        </Flex>

        <Flex gap="4" wrap="wrap">
          <Text size="2" color="gray">Email: {data.auth?.email ?? "—"}</Text>
          <Text size="2" color="gray">Signed up: {fmt(data.auth?.signupAt)}</Text>
          <Text size="2" color="gray">Profile: {data.profilePublic ? "Public" : "Private"}</Text>
        </Flex>

        {error && <Text color="red" size="2">{error}</Text>}

        <Flex gap="4" wrap="wrap" align="end">
          <Flex direction="column" gap="1">
            <Text size="1" color="gray">Subscription tier</Text>
            <Select
              value={data.tier}
              onValueChange={(v) => void patch({ tier: v })}
              disabled={busy}
            >
              {TIER_OPTIONS.map((t) => (
                <Select.Item key={t} value={t}>{t}</Select.Item>
              ))}
            </Select>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray">Role override</Text>
            <Select
              value={data.appRole ?? "DEFAULT"}
              onValueChange={(v) => void patch({ appRole: v === "DEFAULT" ? null : v })}
              disabled={busy}
            >
              {ROLE_OPTIONS.map((r) => (
                <Select.Item key={r.value} value={r.value}>{r.label}</Select.Item>
              ))}
            </Select>
          </Flex>

          <Button
            variant="soft"
            color={isDeactivated ? "green" : "red"}
            loading={busy}
            onClick={() => void patch({ deactivated: !isDeactivated })}
          >
            {isDeactivated ? "Reactivate account" : "Deactivate account"}
          </Button>
        </Flex>

        {data.auditLog.length > 0 && (
          <Flex direction="column" gap="1">
            <Text size="2" weight="bold">Recent admin actions</Text>
            {data.auditLog.map((a) => (
              <Text key={a.id} size="1" color="gray">
                {fmt(a.createdAt)} — {a.action}
                {a.detail && Object.keys(a.detail).length > 0
                  ? ` (${JSON.stringify(a.detail)})`
                  : ""}{" "}
                by @{a.actor.username}
              </Text>
            ))}
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
