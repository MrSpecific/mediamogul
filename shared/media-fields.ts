// Per-media-type presentation config: which credits and first-class fields are
// "standard" for each type, in display order. This is descriptive, NOT a
// constraint — any field/credit can still be set on any media item. Used to
// drive bylines, fact rows, and (later) add/edit forms.
//
// Unions mirror the Prisma `MediaType` / `CreditRole` enums.

export type MediaType = "MOVIE" | "TV_SHOW" | "BOOK" | "AUDIOBOOK" | "MAGAZINE";

export type CreditRole =
  | "AUTHOR"
  | "ILLUSTRATOR"
  | "EDITOR"
  | "DIRECTOR"
  | "CREATOR"
  | "NARRATOR"
  | "WRITER"
  | "PRODUCER"
  | "CAST"
  | "OTHER";

/** A first-class MediaItem column worth surfacing for a type. */
export interface FieldSpec {
  key: "publisher" | "pageCount" | "runtimeMinutes" | "seasons" | "episodes";
  label: string;
  format?: "runtime" | "text";
}

export interface CreditRoleSpec {
  role: CreditRole;
  label: string;
  /** Byline prefix, e.g. "Directed by". Omit to show names bare. */
  byline?: string;
}

export interface MediaTypeConfig {
  label: string;
  icon: string;
  /** base-ic AccentColor name. */
  color: string;
  /** Consumption verb, e.g. "watch" / "read" / "listen". */
  logVerb: string;
  /** Past tense, e.g. "watched" / "read" / "listened". */
  logPast: string;
  /** Credit role that headlines the item (drives the byline). */
  primaryCredit?: CreditRole;
  /** Credits typically relevant to this type, in display order. */
  credits: CreditRoleSpec[];
  /** First-class fields typically relevant to this type, in display order. */
  fields: FieldSpec[];
}

export const MEDIA_FIELDS: Record<MediaType, MediaTypeConfig> = {
  MOVIE: {
    label: "Movie",
    icon: "🎬",
    color: "red",
    logVerb: "watch",
    logPast: "watched",
    primaryCredit: "DIRECTOR",
    credits: [
      { role: "DIRECTOR", label: "Director", byline: "Directed by" },
      { role: "WRITER", label: "Writer" },
      { role: "PRODUCER", label: "Producer" },
      { role: "CAST", label: "Cast" },
    ],
    fields: [
      { key: "runtimeMinutes", label: "Runtime", format: "runtime" },
    ],
  },
  TV_SHOW: {
    label: "TV",
    icon: "📺",
    color: "violet",
    logVerb: "watch",
    logPast: "watched",
    primaryCredit: "CREATOR",
    credits: [
      { role: "CREATOR", label: "Creator", byline: "Created by" },
      { role: "WRITER", label: "Writer" },
      { role: "CAST", label: "Cast" },
    ],
    fields: [
      { key: "seasons", label: "Seasons" },
      { key: "episodes", label: "Episodes" },
      { key: "runtimeMinutes", label: "Episode length", format: "runtime" },
    ],
  },
  BOOK: {
    label: "Book",
    icon: "📖",
    color: "amber",
    logVerb: "read",
    logPast: "read",
    primaryCredit: "AUTHOR",
    credits: [
      { role: "AUTHOR", label: "Author", byline: "By" },
      { role: "ILLUSTRATOR", label: "Illustrator" },
      { role: "EDITOR", label: "Editor" },
    ],
    fields: [
      { key: "pageCount", label: "Pages" },
      { key: "publisher", label: "Publisher" },
    ],
  },
  AUDIOBOOK: {
    label: "Audiobook",
    icon: "🎧",
    color: "jade",
    logVerb: "listen",
    logPast: "listened",
    primaryCredit: "AUTHOR",
    credits: [
      { role: "AUTHOR", label: "Author", byline: "By" },
      { role: "NARRATOR", label: "Narrator" },
    ],
    fields: [
      { key: "runtimeMinutes", label: "Length", format: "runtime" },
      { key: "publisher", label: "Publisher" },
    ],
  },
  MAGAZINE: {
    label: "Magazine",
    icon: "📰",
    color: "teal",
    logVerb: "read",
    logPast: "read",
    primaryCredit: "EDITOR",
    credits: [
      { role: "EDITOR", label: "Editor" },
      { role: "AUTHOR", label: "Contributor" },
    ],
    fields: [
      { key: "publisher", label: "Publisher" },
    ],
  },
};

export const mediaTypeLabel = (t: MediaType): string => MEDIA_FIELDS[t].label;

/** Capitalize the first letter of each word (for genre labels, etc.). */
export const titleCase = (s: string): string =>
  s.replace(/\b\w/g, (c) => c.toUpperCase());

export function formatRuntime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** Format a field value for display (null/empty → undefined). */
export function formatFieldValue(
  spec: FieldSpec,
  value: number | string | null | undefined,
): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (spec.format === "runtime" && typeof value === "number") {
    return formatRuntime(value);
  }
  return String(value);
}
