import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Flex,
  Heading,
  Input,
  Select,
  Text,
  Toggle,
  ToggleGroup,
} from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { MEDIA_TYPES, type Genre, type MediaType } from "../lib/types";

export function AdminGenresPage() {
  const { data: genres, reload } = useApiData<Genre[]>("/genres");
  const [name, setName] = useState("");
  const [types, setTypes] = useState<MediaType[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [deleteSource, setDeleteSource] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const notify = (fn: () => void) => {
    setMsg(null);
    setErr(null);
    fn();
  };

  const create = async () => {
    if (!name.trim()) return;
    try {
      await apiSend("POST", "/genres", {
        name: name.trim(),
        applicableTypes: types,
      });
      setName("");
      setTypes([]);
      setMsg("Genre added.");
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const replace = async () => {
    if (!fromId || !toId) return;
    try {
      const r = await apiSend<{ reassigned: number }>(
        "POST",
        "/genres/replace",
        { fromGenreId: fromId, toGenreId: toId, deleteSource },
      );
      setMsg(`Reassigned ${r.reassigned} item(s).`);
      setFromId("");
      setToId("");
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    await apiSend("DELETE", `/genres/${id}`);
    reload();
  };

  return (
    <Flex direction="column" gap="5">
      <Heading size="7">Genres</Heading>
      {msg && (
        <Text color="green" size="2">
          {msg}
        </Text>
      )}
      {err && (
        <Text color="red" size="2">
          {err}
        </Text>
      )}

      <Card size="3">
        <Flex direction="column" gap="3">
          <Heading size="4">Add genre</Heading>
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="e.g. Mockumentary"
            />
          </Field>
          <Field label="Applicable types" description="Leave empty for all types">
            <ToggleGroup
              multiple
              value={types}
              onValueChange={(v: unknown[]) => setTypes(v as MediaType[])}
            >
              {MEDIA_TYPES.map((t) => (
                <Toggle key={t.value} value={t.value}>
                  {t.label}
                </Toggle>
              ))}
            </ToggleGroup>
          </Field>
          <Flex>
            <Button onClick={() => notify(() => void create())}>Add genre</Button>
          </Flex>
        </Flex>
      </Card>

      <Card size="3">
        <Flex direction="column" gap="3">
          <Heading size="4">Replace genre</Heading>
          <Text size="2" color="gray">
            Reassign every media item from one genre to another.
          </Text>
          <Flex gap="3" wrap="wrap" align="end">
            <Field label="From">
              <Select
                value={fromId}
                onValueChange={(v) => setFromId(v as string)}
                placeholder="Choose…"
              >
                {genres?.map((g) => (
                  <Select.Item key={g.id} value={g.id}>
                    {g.name} ({g._count?.media ?? 0})
                  </Select.Item>
                ))}
              </Select>
            </Field>
            <Field label="To">
              <Select
                value={toId}
                onValueChange={(v) => setToId(v as string)}
                placeholder="Choose…"
              >
                {genres?.map((g) => (
                  <Select.Item key={g.id} value={g.id}>
                    {g.name}
                  </Select.Item>
                ))}
              </Select>
            </Field>
            <Button onClick={() => notify(() => void replace())}>Replace</Button>
          </Flex>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={deleteSource}
              onChange={(e) => setDeleteSource(e.currentTarget.checked)}
            />
            <Text size="2">Delete the source genre afterward</Text>
          </label>
        </Flex>
      </Card>

      <Flex direction="column" gap="2">
        <Heading size="4">All genres ({genres?.length ?? 0})</Heading>
        {genres?.map((g) => (
          <Card key={g.id} size="1">
            <Flex justify="space-between" align="center" gap="2" wrap="wrap">
              <Flex gap="2" align="center" wrap="wrap">
                <Text weight="medium">{g.name}</Text>
                <Text size="1" color="gray">
                  {g._count?.media ?? 0} items
                </Text>
                {g.applicableTypes.length ? (
                  g.applicableTypes.map((t) => (
                    <Badge key={t} size="1" variant="outline">
                      {t}
                    </Badge>
                  ))
                ) : (
                  <Badge size="1" variant="outline">
                    all types
                  </Badge>
                )}
              </Flex>
              <Button
                size="1"
                variant="ghost"
                color="red"
                onClick={() => void remove(g.id)}
              >
                Delete
              </Button>
            </Flex>
          </Card>
        ))}
      </Flex>
    </Flex>
  );
}
