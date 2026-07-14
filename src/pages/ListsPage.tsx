import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Dialog,
  Field,
  Flex,
  Heading,
  Input,
  Text,
} from "@wlcr/base-ic";
import { Plus } from "lucide-react";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { SegmentedControl } from "../components/SegmentedControl";
import type { ListSummary, Visibility } from "../lib/types";

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "PRIVATE", label: "Private" },
  { value: "UNLISTED", label: "Unlisted" },
  { value: "PUBLIC", label: "Public" },
];

function ListRow({ list }: { list: ListSummary }) {
  return (
    <Card size="2">
      <Link to={`/lists/${list.id}`} className="media-card-link">
        <Flex justify="space-between" align="center" gap="3">
          <Text weight="medium">{list.title}</Text>
          <Text size="1" color="gray">
            {list._count?.items ?? 0} items · {list.visibility.toLowerCase()}
          </Text>
        </Flex>
      </Link>
    </Card>
  );
}

export function ListsPage() {
  const { data, reload } = useApiData<{
    owned: ListSummary[];
    saved: ListSummary[];
  }>("/me/lists");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");
  const [saving, setSaving] = useState(false);

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
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} aria-hidden /> New list
        </Button>
      </Flex>

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
          <ListRow key={l.id} list={l} />
        ))}
      </Flex>

      {data && data.saved.length > 0 && (
        <Flex direction="column" gap="3">
          <Heading size="4">Saved lists</Heading>
          {data.saved.map((l) => (
            <ListRow key={l.id} list={l} />
          ))}
        </Flex>
      )}
    </Flex>
  );
}
