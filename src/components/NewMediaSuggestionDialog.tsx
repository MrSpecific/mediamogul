import { useState } from "react";
import { Button, Dialog, Field, Flex, Input, Select, Text, Textarea } from "@wlcr/base-ic";
import { apiSend } from "../lib/api";
import { MEDIA_TYPES, type MediaType } from "../lib/types";

export function NewMediaSuggestionDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MediaType>("MOVIE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [wikipediaUrl, setWikipediaUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await apiSend("POST", "/submissions", {
        kind: "NEW_MEDIA",
        proposedData: { type, title: title.trim(), shortDescription: description.trim() || null, wikipediaUrl: wikipediaUrl.trim() || null },
        message: notes.trim() || undefined,
      });
      setDone(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setDone(false); }} title="Suggest new media"
    content={done ? <Text color="green">Thanks — your suggestion is awaiting review.</Text> : <Flex direction="column" gap="3">
      <Field label="Type"><Select value={type} onValueChange={(v) => setType(v as MediaType)}>{MEDIA_TYPES.map((t) => <Select.Item key={t.value} value={t.value}>{t.label}</Select.Item>)}</Select></Field>
      <Field label="Title" required><Input value={title} onChange={(e) => setTitle(e.currentTarget.value)} /></Field>
      <Field label="Short description"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.currentTarget.value)} /></Field>
      <Field label="Wikipedia URL"><Input type="url" value={wikipediaUrl} onChange={(e) => setWikipediaUrl(e.currentTarget.value)} /></Field>
      <Field label="Notes for reviewers"><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} /></Field>
      {error && <Text color="red">{error}</Text>}
    </Flex>} footer={<Flex justify="end" gap="2"><Button variant="soft" onClick={() => setOpen(false)}>{done ? "Close" : "Cancel"}</Button>{!done && <Button loading={saving} disabled={!title.trim()} onClick={() => void submit()}>Submit suggestion</Button>}</Flex>}>
    <Button variant="soft" onClick={() => setOpen(true)}>Suggest new media</Button>
  </Dialog>;
}
