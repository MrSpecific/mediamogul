import { useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Field,
  Flex,
  Input,
  Select,
  Text,
  Textarea,
} from "@wlcr/base-ic";
import { Flag, Plus, X } from "lucide-react";
import { apiSend } from "../lib/api";
import { useApiData } from "../lib/hooks";
import { MediaPicker } from "./MediaPicker";
import { titleCase } from "../../shared/media-fields";
import {
  STREAMING_PROVIDERS,
  providerFromUrl,
  streamingLabel,
} from "../lib/streaming";
import type { StreamingProvider } from "../lib/streaming";
import type { ContentRating, Genre, MediaDetail, MediaItem } from "../lib/types";

type Kind = "MEDIA_EDIT" | "DUPLICATE" | "INCORRECT_INFO" | "ABUSE" | "OTHER";

// Special "fields" with bespoke editors, kept distinct from real column keys.
const GENRES_FIELD = "__genres";
const STREAMING_FIELD = "__streaming";
const CONTENT_RATING_FIELD = "__contentRating";

const SCALAR_FIELDS = [
  ["title", "Title"],
  ["subtitle", "Subtitle"],
  ["shortDescription", "Short description"],
  ["synopsis", "Synopsis"],
  ["wikipediaUrl", "Wikipedia URL"],
  ["releaseDate", "Release date"],
  ["publisher", "Publisher"],
  ["pageCount", "Page count"],
  ["runtimeMinutes", "Runtime"],
  ["seasons", "Seasons"],
  ["episodes", "Episodes"],
] as const;
const NUMERIC = new Set(["pageCount", "runtimeMinutes", "seasons", "episodes"]);

export function MediaFeedbackDialog({ media }: { media: MediaDetail }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("MEDIA_EDIT");
  const [field, setField] = useState<string>("title");
  const [value, setValue] = useState(media.title);
  const [message, setMessage] = useState("");
  const [duplicate, setDuplicate] = useState<MediaItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Genre editor state (selected = the genres the item should end up with).
  const applied = new Set(media.genres.map((g) => g.id));
  const [genreSel, setGenreSel] = useState<Set<string>>(applied);
  const { data: allGenres } = useApiData<Genre[]>(`/genres?type=${media.type}`);

  // Streaming editor state.
  const [removeStreaming, setRemoveStreaming] = useState<Set<string>>(new Set());
  const [pendingStreaming, setPendingStreaming] = useState<
    { provider: StreamingProvider; url: string }[]
  >([]);
  const [addProvider, setAddProvider] = useState<StreamingProvider>("NETFLIX");
  const [addUrl, setAddUrl] = useState("");

  // Content-rating editor state.
  const { data: ratings } = useApiData<ContentRating[]>(
    `/content-ratings?type=${media.type}`,
  );
  const currentRatingId = media.contentRating?.id ?? "";
  const [ratingSel, setRatingSel] = useState(currentRatingId);

  const canStreaming = media.type === "MOVIE" || media.type === "TV_SHOW";
  const hasRatings = Boolean(ratings && ratings.length > 0);

  const genresAdd = [...genreSel].filter((id) => !applied.has(id));
  const genresRemove = [...applied].filter((id) => !genreSel.has(id));
  const genreChanged = genresAdd.length > 0 || genresRemove.length > 0;
  const streamingChanged =
    pendingStreaming.length > 0 || removeStreaming.size > 0;

  const changeField = (next: string) => {
    setField(next);
    if (next === GENRES_FIELD) {
      setGenreSel(new Set(media.genres.map((g) => g.id)));
      return;
    }
    if (next === STREAMING_FIELD) {
      setRemoveStreaming(new Set());
      setPendingStreaming([]);
      return;
    }
    if (next === CONTENT_RATING_FIELD) {
      setRatingSel(currentRatingId);
      return;
    }
    const current = media[next as keyof MediaDetail];
    setValue(current == null ? "" : String(current).slice(0, 10));
  };

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const addPending = () => {
    if (!addUrl.trim()) return;
    setPendingStreaming((p) => [
      ...p,
      { provider: addProvider, url: addUrl.trim() },
    ]);
    setAddUrl("");
  };

  const proposedDataFor = (): Record<string, unknown> | undefined => {
    if (kind !== "MEDIA_EDIT") return undefined;
    if (field === GENRES_FIELD) return { genresAdd, genresRemove };
    if (field === STREAMING_FIELD) {
      return {
        streamingAdd: pendingStreaming,
        streamingRemove: [...removeStreaming],
      };
    }
    if (field === CONTENT_RATING_FIELD) {
      return { contentRatingId: ratingSel || null };
    }
    const proposedValue = NUMERIC.has(field)
      ? value.trim()
        ? Number(value)
        : null
      : field === "title"
        ? value.trim()
        : value.trim() || null;
    return { [field]: proposedValue };
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiSend("POST", "/submissions", {
        kind,
        targetMediaItemId: media.id,
        duplicateMediaItemId: duplicate?.id,
        proposedData: proposedDataFor(),
        message: message.trim() || undefined,
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const editInvalid =
    kind === "MEDIA_EDIT" &&
    (field === GENRES_FIELD
      ? !genreChanged
      : field === STREAMING_FIELD
        ? !streamingChanged
        : field === CONTENT_RATING_FIELD
          ? ratingSel === currentRatingId
          : !value.trim());
  const submitDisabled = editInvalid || (kind === "DUPLICATE" && !duplicate);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDone(false);
      }}
      title="Suggest an edit or report a problem"
      content={
        done ? (
          <Text color="green">Thanks — your submission is awaiting review.</Text>
        ) : (
          <Flex direction="column" gap="3">
            <Field label="What would you like to do?">
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <Select.Item value="MEDIA_EDIT">Suggest an edit</Select.Item>
                <Select.Item value="DUPLICATE">Report a duplicate</Select.Item>
                <Select.Item value="INCORRECT_INFO">
                  Report incorrect information
                </Select.Item>
                <Select.Item value="ABUSE">Report abuse</Select.Item>
                <Select.Item value="OTHER">Something else</Select.Item>
              </Select>
            </Field>
            {kind === "MEDIA_EDIT" && (
              <>
                <Field label="Field">
                  <Select
                    value={field}
                    onValueChange={(v) => changeField(v as string)}
                  >
                    {SCALAR_FIELDS.map(([key, label]) => (
                      <Select.Item key={key} value={key}>
                        {label}
                      </Select.Item>
                    ))}
                    <Select.Item value={GENRES_FIELD}>Genres</Select.Item>
                    {canStreaming && (
                      <Select.Item value={STREAMING_FIELD}>
                        Available on
                      </Select.Item>
                    )}
                    {hasRatings && (
                      <Select.Item value={CONTENT_RATING_FIELD}>
                        Content rating
                      </Select.Item>
                    )}
                  </Select>
                </Field>

                {field === GENRES_FIELD ? (
                  <Field
                    label="Genres"
                    description="Checked genres are kept or added; unchecked are removed."
                  >
                    <Flex direction="column" gap="1">
                      {(allGenres ?? []).map((g) => (
                        <label key={g.id} className="scrape-field">
                          <Checkbox
                            size="1"
                            checked={genreSel.has(g.id)}
                            onCheckedChange={(v) =>
                              setGenreSel((s) => toggle(s, g.id, !!v))
                            }
                          />
                          <Text size="2">{titleCase(g.name)}</Text>
                        </label>
                      ))}
                    </Flex>
                  </Field>
                ) : field === STREAMING_FIELD ? (
                  <Field label="Available on">
                    <Flex direction="column" gap="2">
                      {media.streaming.map((s) => (
                        <label key={s.id} className="scrape-field">
                          <Checkbox
                            size="1"
                            checked={removeStreaming.has(s.id)}
                            onCheckedChange={(v) =>
                              setRemoveStreaming((set) => toggle(set, s.id, !!v))
                            }
                          />
                          <span className="scrape-field-text">
                            <Text size="2">
                              Remove {streamingLabel(s.provider)}
                            </Text>
                            <Text size="1" color="gray" truncate>
                              {s.url}
                            </Text>
                          </span>
                        </label>
                      ))}
                      {pendingStreaming.map((p, i) => (
                        <Flex key={i} gap="2" align="center">
                          <Badge variant="soft" color="green">
                            Add {streamingLabel(p.provider)}
                          </Badge>
                          <Text size="1" color="gray" truncate>
                            {p.url}
                          </Text>
                          <Button
                            size="1"
                            variant="ghost"
                            color="red"
                            onClick={() =>
                              setPendingStreaming((list) =>
                                list.filter((_, idx) => idx !== i),
                              )
                            }
                          >
                            <X size={12} aria-hidden />
                          </Button>
                        </Flex>
                      ))}
                      <Flex gap="2" align="center" wrap="wrap">
                        <Select
                          value={addProvider}
                          onValueChange={(v) =>
                            setAddProvider(v as StreamingProvider)
                          }
                          size="1"
                        >
                          {STREAMING_PROVIDERS.map((p) => (
                            <Select.Item key={p.value} value={p.value}>
                              {p.label}
                            </Select.Item>
                          ))}
                        </Select>
                        <Input
                          type="url"
                          placeholder="https://… deep link"
                          value={addUrl}
                          onChange={(e) => {
                            const next = e.currentTarget.value;
                            setAddUrl(next);
                            // Recognize the provider from a pasted deep link.
                            const detected = providerFromUrl(next);
                            if (detected) setAddProvider(detected);
                          }}
                        />
                        <Button
                          size="1"
                          disabled={!addUrl.trim()}
                          onClick={addPending}
                        >
                          <Plus size={14} aria-hidden /> Add
                        </Button>
                      </Flex>
                    </Flex>
                  </Field>
                ) : field === CONTENT_RATING_FIELD ? (
                  <Field label="Content rating">
                    <Select
                      value={ratingSel}
                      onValueChange={(v) => setRatingSel(v as string)}
                    >
                      <Select.Item value="">Not rated</Select.Item>
                      {(ratings ?? []).map((r) => (
                        <Select.Item key={r.id} value={r.id}>
                          {r.code} — {r.name}
                        </Select.Item>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Field label="Proposed value">
                    {field === "synopsis" || field === "shortDescription" ? (
                      <Textarea
                        rows={5}
                        value={value}
                        onChange={(e) => setValue(e.currentTarget.value)}
                      />
                    ) : (
                      <Input
                        type={
                          NUMERIC.has(field)
                            ? "number"
                            : field === "releaseDate"
                              ? "date"
                              : "text"
                        }
                        value={value}
                        onChange={(e) => setValue(e.currentTarget.value)}
                      />
                    )}
                  </Field>
                )}
              </>
            )}
            {kind === "DUPLICATE" && (
              <Field label="Duplicate item">
                {duplicate ? (
                  <Text>{duplicate.title}</Text>
                ) : (
                  <MediaPicker excludeId={media.id} onPick={setDuplicate} />
                )}
              </Field>
            )}
            <Field
              label="Notes"
              description="Explain the change or report for reviewers."
            >
              <Textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.currentTarget.value)}
              />
            </Field>
            {error && <Text color="red">{error}</Text>}
          </Flex>
        )
      }
      footer={
        <Flex justify="end" gap="2">
          <Button variant="soft" onClick={() => setOpen(false)}>
            {done ? "Close" : "Cancel"}
          </Button>
          {!done && (
            <Button
              loading={saving}
              disabled={submitDisabled}
              onClick={() => void submit()}
            >
              Submit
            </Button>
          )}
        </Flex>
      }
    >
      <Button size="2" variant="ghost" onClick={() => setOpen(true)}>
        <Flag size={14} aria-hidden /> Suggest an edit or report
      </Button>
    </Dialog>
  );
}
