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
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { ContentRatingBadge } from "../components/ContentRatingBadge";
import {
  MEDIA_TYPES,
  RATING_SYSTEMS,
  type ContentRating,
  type MediaType,
  type RatingSystem,
} from "../lib/types";

interface Draft {
  system: RatingSystem;
  code: string;
  name: string;
  description: string;
  applicableTypes: MediaType[];
  rank: string;
}

const EMPTY: Draft = {
  system: "MPAA",
  code: "",
  name: "",
  description: "",
  applicableTypes: [],
  rank: "0",
};

function toPayload(d: Draft) {
  return {
    system: d.system,
    code: d.code.trim(),
    name: d.name.trim(),
    description: d.description.trim() || null,
    applicableTypes: d.applicableTypes,
    rank: Number(d.rank) || 0,
  };
}

export function AdminContentRatingsPage() {
  const { data: ratings, reload } =
    useApiData<ContentRating[]>("/content-ratings");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContentRating | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const patch = (d: Partial<Draft>) => setDraft((p) => ({ ...p, ...d }));
  const patchEdit = (d: Partial<Draft>) => setEditDraft((p) => ({ ...p, ...d }));

  const create = async () => {
    if (!draft.code.trim() || !draft.name.trim()) return;
    setMsg(null);
    setErr(null);
    try {
      await apiSend("POST", "/content-ratings", toPayload(draft));
      setDraft(EMPTY);
      setMsg("Rating added.");
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    await apiSend("DELETE", `/content-ratings/${id}`);
    reload();
  };

  const beginEdit = (r: ContentRating) => {
    setEditing(r);
    setEditDraft({
      system: r.system,
      code: r.code,
      name: r.name,
      description: r.description ?? "",
      applicableTypes: r.applicableTypes,
      rank: String(r.rank),
    });
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editing || !editDraft.code.trim() || !editDraft.name.trim()) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await apiSend("PATCH", `/content-ratings/${editing.id}`, toPayload(editDraft));
      setEditing(null);
      setMsg("Rating updated.");
      reload();
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };

  const typeToggles = (
    value: MediaType[],
    onChange: (v: MediaType[]) => void,
  ) => (
    <ToggleGroup
      multiple
      value={value}
      onValueChange={(v: unknown[]) => onChange(v as MediaType[])}
    >
      {MEDIA_TYPES.map((t) => (
        <Toggle key={t.value} value={t.value}>
          {t.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );

  return (
    <Flex direction="column" gap="5">
      <Heading size="7">Content ratings</Heading>
      <Text color="gray">
        The catalog of maturity ratings media can be assigned (MPAA for film, US
        TV Parental Guidelines for television). Rank orders by severity.
      </Text>
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
        title="Edit content rating"
        content={
          <Flex direction="column" gap="3">
            {editError && (
              <Text color="red" size="2">
                {editError}
              </Text>
            )}
            <Field label="System">
              <Select
                value={editDraft.system}
                onValueChange={(v) => patchEdit({ system: v as RatingSystem })}
              >
                {RATING_SYSTEMS.map((s) => (
                  <Select.Item key={s.value} value={s.value}>
                    {s.label}
                  </Select.Item>
                ))}
              </Select>
            </Field>
            <Flex gap="3" wrap="wrap">
              <Field label="Code">
                <Input
                  value={editDraft.code}
                  onChange={(e) => patchEdit({ code: e.currentTarget.value })}
                />
              </Field>
              <Field label="Rank">
                <Input
                  type="number"
                  value={editDraft.rank}
                  onChange={(e) => patchEdit({ rank: e.currentTarget.value })}
                  style={{ width: 90 }}
                />
              </Field>
            </Flex>
            <Field label="Name">
              <Input
                value={editDraft.name}
                onChange={(e) => patchEdit({ name: e.currentTarget.value })}
              />
            </Field>
            <Field label="Applicable types" description="Leave empty for all types">
              {typeToggles(editDraft.applicableTypes, (v) =>
                patchEdit({ applicableTypes: v }),
              )}
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
              disabled={!editDraft.code.trim() || !editDraft.name.trim()}
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
          <Heading size="4">Add rating</Heading>
          <Field label="System">
            <Select
              value={draft.system}
              onValueChange={(v) => patch({ system: v as RatingSystem })}
            >
              {RATING_SYSTEMS.map((s) => (
                <Select.Item key={s.value} value={s.value}>
                  {s.label}
                </Select.Item>
              ))}
            </Select>
          </Field>
          <Flex gap="3" wrap="wrap">
            <Field label="Code">
              <Input
                value={draft.code}
                onChange={(e) => patch({ code: e.currentTarget.value })}
                placeholder="e.g. PG-13"
              />
            </Field>
            <Field label="Rank">
              <Input
                type="number"
                value={draft.rank}
                onChange={(e) => patch({ rank: e.currentTarget.value })}
                style={{ width: 90 }}
              />
            </Field>
          </Flex>
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(e) => patch({ name: e.currentTarget.value })}
              placeholder="e.g. Parents Strongly Cautioned"
            />
          </Field>
          <Field label="Applicable types" description="Leave empty for all types">
            {typeToggles(draft.applicableTypes, (v) =>
              patch({ applicableTypes: v }),
            )}
          </Field>
          <Flex>
            <Button onClick={() => void create()}>Add rating</Button>
          </Flex>
        </Flex>
      </Card>

      <Flex direction="column" gap="2">
        <Heading size="4">All ratings ({ratings?.length ?? 0})</Heading>
        {ratings?.map((r) => (
          <Card key={r.id} size="1">
            <Flex justify="space-between" align="center" gap="2" wrap="wrap">
              <Flex gap="2" align="center" wrap="wrap">
                <ContentRatingBadge rating={r} size="1" />
                <Text weight="medium">{r.name}</Text>
                <Badge size="1" variant="outline">
                  {r.system}
                </Badge>
                <Text size="1" color="gray">
                  {r._count?.media ?? 0} items
                </Text>
              </Flex>
              <Flex gap="1">
                <Button size="1" variant="ghost" onClick={() => beginEdit(r)}>
                  <Pencil size={13} aria-hidden /> Edit
                </Button>
                <Button
                  size="1"
                  variant="ghost"
                  color="red"
                  onClick={() => void remove(r.id)}
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
