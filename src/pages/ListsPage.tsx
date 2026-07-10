import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Field,
  Flex,
  Heading,
  Input,
  Select,
  Text,
} from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import type { ListSummary, Visibility } from "../lib/types";

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
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");

  const create = async () => {
    if (!title.trim()) return;
    await apiSend("POST", "/lists", { title, visibility, allowedTypes: [] });
    setTitle("");
    reload();
  };

  return (
    <Flex direction="column" gap="5">
      <Heading size="7">Lists</Heading>

      <Card size="3">
        <Flex direction="column" gap="3">
          <Heading size="4">New list</Heading>
          <Flex gap="3" wrap="wrap" align="end">
            <Field label="Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                placeholder="Watchlist"
              />
            </Field>
            <Field label="Visibility">
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as Visibility)}
                placeholder="Visibility"
              >
                <Select.Item value="PRIVATE">Private</Select.Item>
                <Select.Item value="UNLISTED">Unlisted</Select.Item>
                <Select.Item value="PUBLIC">Public</Select.Item>
              </Select>
            </Field>
            <Button onClick={() => void create()}>Create</Button>
          </Flex>
        </Flex>
      </Card>

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
