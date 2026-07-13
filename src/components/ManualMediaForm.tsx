import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Field,
  Flex,
  Heading,
  Input,
  Text,
  Textarea,
  Toggle,
  ToggleGroup,
} from "@wlcr/base-ic";
import { apiSend, apiUpload } from "../lib/api";
import { useApiData } from "../lib/hooks";
import { SegmentedControl } from "./SegmentedControl";
import { MEDIA_FIELDS, type MediaType } from "../../shared/media-fields";
import type { Genre } from "../lib/types";

const TYPE_OPTIONS = (Object.keys(MEDIA_FIELDS) as MediaType[]).map((value) => ({
  value,
  label: MEDIA_FIELDS[value].label,
}));

const NUMERIC = new Set(["pageCount", "runtimeMinutes", "seasons", "episodes"]);

export function ManualMediaForm() {
  const navigate = useNavigate();
  const [type, setType] = useState<MediaType>("MOVIE");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [credits, setCredits] = useState<Record<string, string>>({});
  const [genreIds, setGenreIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg = MEDIA_FIELDS[type];
  const { data: genres } = useApiData<Genre[]>(`/genres?type=${type}`);

  // Reset genre selection when the type changes (available genres differ).
  const changeType = (t: MediaType) => {
    setType(t);
    setGenreIds([]);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await apiUpload<{ url: string }>("/media/assets", file);
      setCoverUrl(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = { type, title: title.trim() };
    if (subtitle.trim()) payload.subtitle = subtitle.trim();
    if (releaseDate) payload.releaseDate = releaseDate;
    if (synopsis.trim()) payload.synopsis = synopsis.trim();
    if (coverUrl) payload.coverImageUrl = coverUrl;
    for (const spec of cfg.fields) {
      const v = fields[spec.key]?.trim();
      if (v) payload[spec.key] = NUMERIC.has(spec.key) ? Number(v) : v;
    }
    const creditList = cfg.credits.flatMap((cr) =>
      (credits[cr.role] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ role: cr.role, name })),
    );
    if (creditList.length) payload.credits = creditList;
    if (genreIds.length) payload.genreIds = genreIds;

    try {
      const item = await apiSend<{ id: string }>("POST", "/media", payload);
      navigate(`/media/${item.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Card size="3">
      <Flex direction="column" gap="4">
        <Heading size="4">Add media manually</Heading>

        <Field label="Type">
          <SegmentedControl
            ariaLabel="Media type"
            value={type}
            onChange={changeType}
            options={TYPE_OPTIONS}
          />
        </Field>

        <Flex gap="4" wrap="wrap" align="start">
          <Flex direction="column" gap="2" align="center">
            <div className="detail-cover" style={{ width: 140 }}>
              {coverUrl && <img src={coverUrl} alt="" />}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => void onFile(e.currentTarget.files?.[0])}
            />
            <Button
              size="1"
              variant="soft"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {coverUrl ? "Replace image" : "Upload image"}
            </Button>
          </Flex>

          <Flex direction="column" gap="3" style={{ flex: 1, minWidth: 260 }}>
            <Field label="Title" required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                placeholder="Title"
              />
            </Field>
            <Field label="Subtitle">
              <Input
                value={subtitle}
                onChange={(e) => setSubtitle(e.currentTarget.value)}
                placeholder="Subtitle or tagline (optional)"
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
          </Flex>
        </Flex>

        {cfg.credits.map((cr) => (
          <Field
            key={cr.role}
            label={cr.label}
            description="Separate multiple names with commas"
          >
            <Input
              value={credits[cr.role] ?? ""}
              onChange={(e) =>
                setCredits((c) => ({ ...c, [cr.role]: e.currentTarget.value }))
              }
              placeholder={cr.label}
            />
          </Field>
        ))}

        {genres && genres.length > 0 && (
          <Field label="Genres" description="Choose any that apply">
            <ToggleGroup
              multiple
              value={genreIds}
              onValueChange={(v: unknown[]) => setGenreIds(v as string[])}
            >
              {genres.map((g) => (
                <Toggle key={g.id} value={g.id}>
                  {g.name}
                </Toggle>
              ))}
            </ToggleGroup>
          </Field>
        )}

        <Field label="Synopsis">
          <Textarea
            rows={4}
            value={synopsis}
            onChange={(e) => setSynopsis(e.currentTarget.value)}
          />
        </Field>

        {error && <Text color="red">{error}</Text>}
        <Flex>
          <Button onClick={() => void submit()} loading={saving}>
            Add to catalog
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}
