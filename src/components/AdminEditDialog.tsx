import { useEffect, useState } from "react";
import { Button, Dialog, Field, Flex, Input, Text, Textarea } from "@wlcr/base-ic";
import { apiSend } from "../lib/api";
import { MEDIA_FIELDS } from "../../shared/media-fields";
import type { MediaDetail } from "../lib/types";

const NUMERIC = new Set(["pageCount", "runtimeMinutes", "seasons", "episodes"]);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  media: MediaDetail;
  onChanged?: () => void;
}

/** Admin: directly edit an item's core text/number fields (title, subtitle,
 *  descriptions, release date, and the type-specific facts). Saves via
 *  PATCH /media/:id. Genres, rating, cover and streaming have their own editors. */
export function AdminEditDialog({ open, onOpenChange, media, onChanged }: Props) {
  const cfg = MEDIA_FIELDS[media.type];
  const [title, setTitle] = useState(media.title);
  const [subtitle, setSubtitle] = useState(media.subtitle ?? "");
  const [releaseDate, setReleaseDate] = useState(
    media.releaseDate?.slice(0, 10) ?? "",
  );
  const [shortDescription, setShortDescription] = useState(
    media.shortDescription ?? "",
  );
  const [synopsis, setSynopsis] = useState(media.synopsis ?? "");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Re-sync the form with the latest item each time the dialog opens. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setTitle(media.title);
    setSubtitle(media.subtitle ?? "");
    setReleaseDate(media.releaseDate?.slice(0, 10) ?? "");
    setShortDescription(media.shortDescription ?? "");
    setSynopsis(media.synopsis ?? "");
    const f: Record<string, string> = {};
    for (const spec of cfg.fields) {
      const v = media[spec.key];
      f[spec.key] = v == null ? "" : String(v);
    }
    setFields(f);
    setError(null);
  }, [open, media, cfg.fields]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const patch: Record<string, unknown> = {
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      releaseDate: releaseDate || null,
      shortDescription: shortDescription.trim() || null,
      synopsis: synopsis.trim() || null,
    };
    for (const spec of cfg.fields) {
      const v = fields[spec.key]?.trim() ?? "";
      patch[spec.key] = v ? (NUMERIC.has(spec.key) ? Number(v) : v) : null;
    }
    try {
      await apiSend("PATCH", `/media/${media.id}`, patch);
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="large"
      title="Edit details"
      description="Directly edit this item's fields. Genres, rating, cover and streaming are edited separately."
      content={
        <Flex direction="column" gap="3">
          <Field label="Title" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
            />
          </Field>
          <Field label="Subtitle">
            <Input
              value={subtitle}
              onChange={(e) => setSubtitle(e.currentTarget.value)}
            />
          </Field>
          <Field label="Release date">
            <Input
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.currentTarget.value)}
            />
          </Field>
          {cfg.fields.map((spec) => (
            <Field key={spec.key} label={spec.label}>
              <Input
                type={NUMERIC.has(spec.key) ? "number" : "text"}
                value={fields[spec.key] ?? ""}
                onChange={(e) =>
                  setFields((f) => ({ ...f, [spec.key]: e.currentTarget.value }))
                }
              />
            </Field>
          ))}
          <Field label="Short description">
            <Textarea
              rows={2}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.currentTarget.value)}
            />
          </Field>
          <Field label="Synopsis">
            <Textarea
              rows={5}
              value={synopsis}
              onChange={(e) => setSynopsis(e.currentTarget.value)}
            />
          </Field>
          {error && (
            <Text color="red" size="2">
              {error}
            </Text>
          )}
        </Flex>
      }
      footer={
        <Flex gap="2" justify="end">
          <Button variant="soft" color="gray" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!title.trim()} onClick={() => void save()}>
            Save changes
          </Button>
        </Flex>
      }
    >
      <span style={{ display: "none" }} aria-hidden />
    </Dialog>
  );
}
