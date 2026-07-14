import { useState } from "react";
import { Button, Dialog, Field, Flex, Input, Select, Text, Textarea } from "@wlcr/base-ic";
import { Flag } from "lucide-react";
import { apiSend } from "../lib/api";
import { MediaPicker } from "./MediaPicker";
import type { MediaItem } from "../lib/types";

type Kind = "MEDIA_EDIT" | "DUPLICATE" | "INCORRECT_INFO" | "ABUSE" | "OTHER";
const FIELDS = [
  ["title", "Title"], ["subtitle", "Subtitle"],
  ["shortDescription", "Short description"], ["synopsis", "Synopsis"],
  ["wikipediaUrl", "Wikipedia URL"], ["releaseDate", "Release date"],
  ["publisher", "Publisher"], ["pageCount", "Page count"],
  ["runtimeMinutes", "Runtime"], ["seasons", "Seasons"], ["episodes", "Episodes"],
] as const;
const NUMERIC = new Set(["pageCount", "runtimeMinutes", "seasons", "episodes"]);

export function MediaFeedbackDialog({ media }: { media: MediaItem }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("MEDIA_EDIT");
  const [field, setField] = useState<string>("title");
  const [value, setValue] = useState(media.title);
  const [message, setMessage] = useState("");
  const [duplicate, setDuplicate] = useState<MediaItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeField = (next: string) => {
    setField(next);
    const current = media[next as keyof MediaItem];
    setValue(current == null ? "" : String(current).slice(0, 10));
  };
  const submit = async () => {
    setSaving(true); setError(null);
    const proposedValue = NUMERIC.has(field)
      ? (value.trim() ? Number(value) : null)
      : (field === "title" ? value.trim() : value.trim() || null);
    try {
      await apiSend("POST", "/submissions", {
        kind,
        targetMediaItemId: media.id,
        duplicateMediaItemId: duplicate?.id,
        proposedData: kind === "MEDIA_EDIT" ? { [field]: proposedValue } : undefined,
        message: message.trim() || undefined,
      });
      setDone(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setDone(false); }}
      title="Suggest an edit or report a problem"
      content={done ? <Text color="green">Thanks — your submission is awaiting review.</Text> : (
        <Flex direction="column" gap="3">
          <Field label="What would you like to do?">
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <Select.Item value="MEDIA_EDIT">Suggest an edit</Select.Item>
              <Select.Item value="DUPLICATE">Report a duplicate</Select.Item>
              <Select.Item value="INCORRECT_INFO">Report incorrect information</Select.Item>
              <Select.Item value="ABUSE">Report abuse</Select.Item>
              <Select.Item value="OTHER">Something else</Select.Item>
            </Select>
          </Field>
          {kind === "MEDIA_EDIT" && <>
            <Field label="Field">
              <Select value={field} onValueChange={(v) => changeField(v as string)}>
                {FIELDS.map(([key, label]) => <Select.Item key={key} value={key}>{label}</Select.Item>)}
              </Select>
            </Field>
            <Field label="Proposed value">
              {field === "synopsis" || field === "shortDescription"
                ? <Textarea rows={5} value={value} onChange={(e) => setValue(e.currentTarget.value)} />
                : <Input type={NUMERIC.has(field) ? "number" : field === "releaseDate" ? "date" : "text"}
                    value={value} onChange={(e) => setValue(e.currentTarget.value)} />}
            </Field>
          </>}
          {kind === "DUPLICATE" && <Field label="Duplicate item">
            {duplicate ? <Text>{duplicate.title}</Text> : <MediaPicker excludeId={media.id} onPick={setDuplicate} />}
          </Field>}
          <Field label="Notes" description="Explain the change or report for reviewers.">
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.currentTarget.value)} />
          </Field>
          {error && <Text color="red">{error}</Text>}
        </Flex>
      )}
      footer={<Flex justify="end" gap="2">
        <Button variant="soft" onClick={() => setOpen(false)}>{done ? "Close" : "Cancel"}</Button>
        {!done && <Button loading={saving} disabled={(kind === "MEDIA_EDIT" && !value.trim()) || (kind === "DUPLICATE" && !duplicate)} onClick={() => void submit()}>Submit</Button>}
      </Flex>}>
      <Button size="2" variant="ghost" onClick={() => setOpen(true)}><Flag size={14} aria-hidden /> Suggest an edit or report</Button>
    </Dialog>
  );
}
