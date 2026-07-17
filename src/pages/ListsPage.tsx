import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Flex,
  Heading,
  Input,
  Text,
} from "@wlcr/base-ic";
import { Plus, Users } from "lucide-react";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { useMe } from "../lib/features";
import { Cover } from "../components/Cover";
import { SegmentedControl } from "../components/SegmentedControl";
import { StarButton } from "../components/StarButton";
import { ListIcon } from "../components/ListIcon";
import { UpgradeCTA } from "../components/UpgradeCTA";
import { type TierId, tierLimit } from "../../shared/tiers";
import type { ListSummary, Visibility } from "../lib/types";
import { VISIBILITY_OPTIONS } from "../lib/visibility";

const visLabel = (v: Visibility) =>
  VISIBILITY_OPTIONS.find((o) => o.value === v)?.label ?? v;

function ListRow({
  list,
  onStarChange,
}: {
  list: ListSummary;
  onStarChange: () => void;
}) {
  const items = list.items ?? [];
  const count = list._count?.items ?? 0;
  const collaborators = list._count?.collaborators ?? 0;
  const extra = count - items.length;

  return (
    <Card size="2">
      <Flex direction="column" gap="2">
        <Flex justify="space-between" align="start" gap="3">
          <Link to={`/lists/${list.id}`} className="media-card-link grow">
            <Flex direction="column" gap="1">
              <Flex gap="2" align="center">
                <ListIcon handle={list.icon} size={16} />
                <Text weight="medium">{list.title}</Text>
              </Flex>
              {list.description && (
                <Text size="1" color="gray" truncate>
                  {list.description}
                </Text>
              )}
            </Flex>
          </Link>
          <StarButton
            listId={list.id}
            starred={!!list.isStarred}
            onChange={onStarChange}
          />
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

        <Flex gap="2" align="center" wrap="wrap">
          <Text size="1" color="gray">
            {count} {count === 1 ? "item" : "items"} · {visLabel(list.visibility)}
            {list.owner ? ` · by @${list.owner.username}` : ""}
          </Text>
          {collaborators > 0 && (
            <Badge size="1" variant="soft" color="gray">
              <Users size={11} aria-hidden /> {collaborators}
            </Badge>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}

export function ListsPage() {
  const { data, reload } = useApiData<{
    owned: ListSummary[];
    saved: ListSummary[];
    shared: ListSummary[];
  }>("/me/lists");
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");
  const [saving, setSaving] = useState(false);

  // Free caps owned lists (see shared/tiers.ts). null = unlimited.
  const listLimit = me?.tier ? tierLimit(me.tier as TierId, "lists") : null;
  const ownedCount = data?.owned.length ?? 0;
  const atLimit = listLimit !== null && ownedCount >= listLimit;

  const create = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiSend("POST", "/lists", { title, visibility, allowedTypes: [] });
      setTitle("");
      setVisibility("PRIVATE");
      setOpen(false);
      reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flex direction="column" gap="5">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading size="7">Lists</Heading>
        <Button onClick={() => setOpen(true)} disabled={atLimit}>
          <Plus size={16} aria-hidden /> New list
        </Button>
      </Flex>

      {atLimit && (
        <UpgradeCTA title="You've reached your list limit">
          Free includes {listLimit} list. Upgrade to Standard for unlimited
          lists, plus shared lists you can build with friends.
        </UpgradeCTA>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New list"
        description="Group media into a collection you can share."
        content={
          <Flex
            as="form"
            direction="column"
            gap="3"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Field label="Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                placeholder="Watchlist"
              />
            </Field>
            <Field label="Visibility">
              <SegmentedControl
                ariaLabel="List visibility"
                value={visibility}
                onChange={setVisibility}
                options={VISIBILITY_OPTIONS}
              />
            </Field>
          </Flex>
        }
        footer={
          <Flex gap="2" justify="end">
            <Button variant="soft" color="gray" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={saving}
              disabled={!title.trim()}
              onClick={() => void create()}
            >
              Create list
            </Button>
          </Flex>
        }
      >
        <span style={{ display: "none" }} aria-hidden />
      </Dialog>

      <Flex direction="column" gap="3">
        <Heading size="4">Your lists</Heading>
        {data && data.owned.length === 0 && (
          <Text color="gray">No lists yet.</Text>
        )}
        {data?.owned.map((l) => (
          <ListRow key={l.id} list={l} onStarChange={reload} />
        ))}
      </Flex>

      {data && data.shared.length > 0 && (
        <Flex direction="column" gap="3">
          <Heading size="4">Shared with you</Heading>
          {data.shared.map((l) => (
            <ListRow key={l.id} list={l} onStarChange={reload} />
          ))}
        </Flex>
      )}

      {data && data.saved.length > 0 && (
        <Flex direction="column" gap="3">
          <Heading size="4">Saved lists</Heading>
          {data.saved.map((l) => (
            <ListRow key={l.id} list={l} onStarChange={reload} />
          ))}
        </Flex>
      )}
    </Flex>
  );
}
