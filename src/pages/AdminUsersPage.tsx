import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Avatar,
  Badge,
  Card,
  Flex,
  Heading,
  Input,
  Select,
  Text,
} from "@wlcr/base-ic";
import { usePaginatedApi } from "../lib/hooks";
import { LoadMore } from "../components/LoadMore";
import { getInitials } from "../lib/initials";
import type { AdminUserRow } from "../lib/types";

const ANY = "ANY";

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString();
}

/** Admin console: browse, search, and filter all users. */
export function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [tier, setTier] = useState(ANY);
  const [role, setRole] = useState(ANY);
  const [status, setStatus] = useState(ANY);
  const [order, setOrder] = useState("new");

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams();
  if (debouncedQ) params.set("q", debouncedQ);
  if (tier !== ANY) params.set("tier", tier);
  if (role !== ANY) params.set("role", role);
  if (status !== ANY) params.set("status", status);
  if (order !== "new") params.set("order", order);

  const { items, loading, loadingMore, hasMore, loadMore, error } =
    usePaginatedApi<AdminUserRow>(`/admin/users?${params.toString()}`);

  return (
    <Flex direction="column" gap="4">
      <Heading size="7">Users</Heading>

      <Flex gap="3" wrap="wrap" align="end">
        <Input
          placeholder="Search username, name, or email…"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          style={{ minWidth: 260 }}
        />
        <Select value={tier} onValueChange={(v) => setTier(v as string)}>
          <Select.Item value={ANY}>All tiers</Select.Item>
          <Select.Item value="FREE">Free</Select.Item>
          <Select.Item value="STANDARD">Standard</Select.Item>
        </Select>
        <Select value={role} onValueChange={(v) => setRole(v as string)}>
          <Select.Item value={ANY}>All roles</Select.Item>
          <Select.Item value="USER">User</Select.Item>
          <Select.Item value="CONTRIBUTOR">Contributor</Select.Item>
          <Select.Item value="EDITOR">Editor</Select.Item>
          <Select.Item value="ADMIN">Admin</Select.Item>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as string)}>
          <Select.Item value={ANY}>Any status</Select.Item>
          <Select.Item value="active">Active</Select.Item>
          <Select.Item value="deactivated">Deactivated</Select.Item>
        </Select>
        <Select value={order} onValueChange={(v) => setOrder(v as string)}>
          <Select.Item value="new">Newest</Select.Item>
          <Select.Item value="old">Oldest</Select.Item>
          <Select.Item value="username">Username (A–Z)</Select.Item>
        </Select>
      </Flex>

      {error && <Text color="red">{error}</Text>}
      {loading && <Text color="gray">Loading…</Text>}
      {!loading && items.length === 0 && (
        <Card><Text color="gray">No users match those filters.</Text></Card>
      )}

      <Flex direction="column" gap="2">
        {items.map((u) => (
          <Card key={u.id} size="2">
            <Flex gap="3" align="center" wrap="wrap" justify="between">
              <Flex gap="3" align="center" style={{ minWidth: 220 }}>
                <Avatar
                  size="3"
                  src={u.avatarUrl ?? undefined}
                  fallback={getInitials(u.displayName ?? u.username)}
                />
                <Flex direction="column" gap="1">
                  <Link to={`/u/${u.username}`}>
                    <Text weight="bold">{u.displayName ?? u.username}</Text>
                  </Link>
                  <Text size="1" color="gray">
                    @{u.username}
                    {u.auth?.email ? ` · ${u.auth.email}` : ""}
                  </Text>
                </Flex>
              </Flex>

              <Flex gap="2" align="center" wrap="wrap">
                <Badge color={u.tier === "STANDARD" ? "green" : "gray"}>{u.tier}</Badge>
                {u.appRole && <Badge color="blue">{u.appRole}</Badge>}
                {!u.profilePublic && <Badge color="gray" variant="soft">Private</Badge>}
                {u.deactivatedAt && <Badge color="red">Deactivated</Badge>}
                <Text size="1" color="gray">
                  {u._count.entries} logged · {u._count.reviews} reviews · {u._count.lists} lists
                </Text>
                <Text size="1" color="gray">Joined {fmtDate(u.createdAt)}</Text>
              </Flex>
            </Flex>
          </Card>
        ))}
      </Flex>

      <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
    </Flex>
  );
}
