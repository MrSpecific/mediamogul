export type MediaType =
  | "MOVIE"
  | "TV_SHOW"
  | "BOOK"
  | "AUDIOBOOK"
  | "MAGAZINE";
export type Visibility = "PRIVATE" | "UNLISTED" | "PUBLIC";
export type EntryStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "ABANDONED";

export const MEDIA_TYPES: { value: MediaType; label: string }[] = [
  { value: "MOVIE", label: "Movies" },
  { value: "TV_SHOW", label: "TV shows" },
  { value: "BOOK", label: "Books" },
  { value: "AUDIOBOOK", label: "Audiobooks" },
  { value: "MAGAZINE", label: "Magazines" },
];

export interface MediaItem {
  id: string;
  type: MediaType;
  title: string;
  coverImageUrl: string | null;
  shortDescription: string | null;
  synopsis: string | null;
  releaseDate: string | null;
  publisher: string | null;
  pageCount: number | null;
  runtimeMinutes: number | null;
  seasons: number | null;
  episodes: number | null;
  genre: string | null;
}

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

export type MediaRelationType =
  | "ALTERNATE_FORMAT"
  | "ADAPTATION"
  | "TRANSLATION";

export interface Credit {
  id: string;
  role: CreditRole;
  name: string;
  externalId: string | null;
  position: number;
}

export interface ExternalId {
  id: string;
  source: string;
  value: string;
  url: string | null;
}

export interface Rating {
  stars: string; // Decimal serialized as string
}
export interface Review {
  id: string;
  title: string | null;
  body: string;
  visibility: Visibility;
  containsSpoilers: boolean;
  user?: { username: string; displayName: string | null; avatarUrl: string | null };
}
export interface MediaEntry {
  id: string;
  status: EntryStatus;
  startedAt: string | null;
  finishedAt: string | null;
  progress: string | null;
  note: string | null;
  mediaItem?: MediaItem;
}

export interface RelatedMedia {
  id: string; // relation id
  type: MediaRelationType;
  media: MediaItem;
}

export interface SeriesMembership {
  id: string; // series id
  title: string;
  position: number;
  total: number;
}

export const RELATION_LABELS: Record<MediaRelationType, string> = {
  ALTERNATE_FORMAT: "Alternate format",
  ADAPTATION: "Adaptation",
  TRANSLATION: "Translation",
};

export interface MediaDetail extends MediaItem {
  externalIds: ExternalId[];
  credits: Credit[];
  related: RelatedMedia[];
  series: SeriesMembership[];
  createdAt: string;
  createdBy: { username: string; displayName: string | null } | null;
  averageRating: number | null;
  ratingCount: number;
  _count: { entries: number; reviews: number };
  you: {
    rating: Rating | null;
    review: Review | null;
    lastEntry: MediaEntry | null;
  };
}

export interface MediaCandidate {
  type: MediaType;
  title: string;
  coverImageUrl?: string;
  shortDescription?: string;
  synopsis?: string;
  releaseDate?: string;
  publisher?: string;
  pageCount?: number;
  runtimeMinutes?: number;
  seasons?: number;
  episodes?: number;
  genre?: string;
  credits?: { role: CreditRole; name: string; externalId?: string }[];
  externalIds: { source: string; value: string; url?: string }[];
  /** Set by /api/lookup when this candidate is already in the catalog. */
  existingId?: string;
}

export interface ListSummary {
  id: string;
  title: string;
  description: string | null;
  visibility: Visibility;
  allowedTypes: MediaType[];
  ranked: boolean;
  _count?: { items: number };
  owner?: { username: string; displayName: string | null };
}

export interface ListDetail extends ListSummary {
  isOwner: boolean;
  isSaved: boolean;
  items: { id: string; note: string | null; position: number; mediaItem: MediaItem }[];
  _count: { items: number; savedBy: number };
}

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isFollowing?: boolean;
  _count?: {
    followers: number;
    following: number;
    entries: number;
    reviews: number;
    lists: number;
  };
}
