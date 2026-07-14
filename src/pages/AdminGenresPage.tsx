import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Flex,
  Heading,
  Input,
  Select,
  Text,
  Toggle,
  ToggleGroup,
} from "@wlcr/base-ic";
import { Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { MEDIA_TYPES, type Genre, type MediaType } from "../lib/types";

export function AdminGenresPage() {
  const navigate = useNavigate();
  const { data: genres, reload } = useApiData<Genre[]>("/genres");
  const [name, setName] = useState("");
  const [types, setTypes] = useState<MediaType[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [deleteSource, setDeleteSource] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Genre | null>(null);
  const [editName, setEditName] = useState("");
  const [editTypes, setEditTypes] = useState<MediaType[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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

  const beginEdit = (genre: Genre) => {
    setEditing(genre);
    setEditName(genre.name);
    setEditTypes(genre.applicableTypes);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim()) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await apiSend("PATCH", `/genres/${editing.id}`, {
        name: editName.trim(),
        applicableTypes: editTypes,
      });
      setEditing(null);
      setMsg("Genre updated.");
      setErr(null);
      reload();
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <Flex direction="column" gap="5">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading size="7">Genres</Heading>
        <Button variant="soft" onClick={() => navigate("/admin/submissions")}>Content submissions</Button>
      </Flex>
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

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !savingEdit) setEditing(null);
        }}
        title="Edit genre"
        description="Changing the name also updates its catalog URL slug."
        content={
          <Flex direction="column" gap="3">
            {editError && (
              <Text color="red" size="2">
                {editError}
              </Text>
            )}
            <Field label="Name">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.currentTarget.value)}
                autoFocus
              />
            </Field>
            <Field
              label="Applicable types"
              description="Leave empty for all types"
            >
              <ToggleGroup
                multiple
                value={editTypes}
                onValueChange={(v: unknown[]) =>
                  setEditTypes(v as MediaType[])
                }
              >
                {MEDIA_TYPES.map((t) => (
                  <Toggle key={t.value} value={t.value}>
                    {t.label}
                  </Toggle>
                ))}
              </ToggleGroup>
            </Field>
          </Flex>
        }
        footer={
          <Flex gap="2" justify="end">
            <Button
              variant="soft"
              color="gray"
              disabled={savingEdit}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button
              loading={savingEdit}
              disabled={!editName.trim()}
              onClick={() => void saveEdit()}
            >
              Save changes
            </Button>
          </Flex>
        }
      >
        <span style={{ display: "none" }} aria-hidden />
      </Dialog>

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
              <Flex gap="1">
                <Button
                  size="1"
                  variant="ghost"
                  onClick={() => beginEdit(g)}
                >
                  <Pencil size={13} aria-hidden /> Edit
                </Button>
                <Button
                  size="1"
                  variant="ghost"
                  color="red"
                  onClick={() => void remove(g.id)}
                >
                  Delete
                </Button>
              </Flex>
            </Flex>
          </Card>
        ))}
      </Flex>
    </Flex>
  );
}
