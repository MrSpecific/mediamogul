export type MediaType =
  | "MOVIE"
  | "TV_SHOW"
  | "BOOK"
  | "AUDIOBOOK"
  | "MAGAZINE";
export type Visibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

/** Visibility choices for review forms (segmented control), most-open first. */
export const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "PUBLIC", label: "Public" },
  { value: "UNLISTED", label: "Unlisted" },
  { value: "PRIVATE", label: "Private" },
];
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
  subtitle: string | null;
  coverImageUrl: string | null;
  shortDescription: string | null;
  synopsis: string | null;
  wikipediaUrl: string | null;
  releaseDate: string | null;
  publisher: string | null;
  pageCount: number | null;
  runtimeMinutes: number | null;
  seasons: number | null;
  episodes: number | null;
}

export interface Genre {
  id: string;
  name: string;
  slug: string;
  applicableTypes: MediaType[];
  _count?: { media: number };
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
  /** Set for per-episode entries (TV shows); null for show-level entries. */
  episode?: {
    number: number;
    title: string | null;
    season: { number: number };
  } | null;
}

export interface RelatedMedia {
  id: string; // relation id
  type: MediaRelationType;
  media: MediaItem;
}

export interface Episode {
  id: string;
  seasonId: string;
  number: number;
  title: string | null;
  synopsis: string | null;
  director: string | null;
  runtimeMinutes: number | null;
  airDate: string | null;
}

export interface Season {
  id: string;
  mediaItemId: string;
  number: number;
  title: string | null;
  synopsis: string | null;
  airDate: string | null;
  episodes: Episode[];
}

export interface SeasonsResponse {
  seasons: Season[];
  watchedEpisodeIds: string[];
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
  genres: { id: string; name: string; slug: string }[];
  related: RelatedMedia[];
  series: SeriesMembership[];
  visibility: Visibility;
  archivedAt: string | null;
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
  subtitle?: string;
  coverImageUrl?: string;
  shortDescription?: string;
  synopsis?: string;
  wikipediaUrl?: string;
  releaseDate?: string;
  publisher?: string;
  pageCount?: number;
  runtimeMinutes?: number;
  seasons?: number;
  episodes?: number;
  genre?: string;
  genreIds?: string[];
  seriesName?: string;
  seriesPosition?: number;
  seriesId?: string;
  credits?: { role: CreditRole; name: string; externalId?: string }[];
  externalIds: { source: string; value: string; url?: string }[];
  /** Set by /api/lookup when this candidate is already in the catalog. */
  existingId?: string;
}

export interface ListItemPreview {
  id: string;
  mediaItem: Pick<MediaItem, "id" | "type" | "title" | "coverImageUrl">;
}

export interface ListSummary {
  id: string;
  title: string;
  description: string | null;
  visibility: Visibility;
  allowedTypes: MediaType[];
  ranked: boolean;
  isStarred?: boolean;
  items?: ListItemPreview[];
  _count?: { items: number; collaborators?: number };
  owner?: { username: string; displayName: string | null };
}

export type CollaboratorStatus = "PENDING" | "ACCEPTED";

export interface ListCollaborator {
  userId: string;
  status: CollaboratorStatus;
  invitedById: string;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface ListDetail extends ListSummary {
  isOwner: boolean;
  isSaved: boolean;
  isStarred: boolean;
  canEdit: boolean;
  myCollabStatus: CollaboratorStatus | null;
  collaborators: ListCollaborator[];
  items: { id: string; note: string | null; position: number; mediaItem: MediaItem }[];
  _count: { items: number; savedBy: number };
}

export interface AppNotification {
  id: string;
  type: "LIST_INVITE";
  message: string;
  readAt: string | null;
  createdAt: string;
  listId: string | null;
  actor: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  list: { id: string; title: string } | null;
}

export type AppRole = "USER" | "CONTRIBUTOR" | "EDITOR" | "ADMIN";
export type SubscriptionTier = "FREE" | "STANDARD";

export interface ProfileCounts {
  followers: number;
  following: number;
  entries: number;
  reviews: number;
  lists: number;
}

/** Who is viewing a profile — drives the self / other / admin variants. */
export interface ProfileViewer {
  isOwner: boolean;
  isAdmin: boolean;
  canFollow: boolean;
}

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  /** Present on GET /me for the current user. */
  isAdmin?: boolean;
  role?: AppRole;
  tier?: SubscriptionTier;
  /** Present on profile responses. */
  profilePublic?: boolean;
  deactivatedAt?: string | null;
  createdAt?: string;
  isFollowing?: boolean;
  viewer?: ProfileViewer;
  _count?: ProfileCounts;
}

/** 403 body returned by GET /users/:username for a private profile. */
export interface PrivateProfile {
  error: "private";
  user: { username: string; displayName: string | null; avatarUrl: string | null };
  viewer: ProfileViewer;
}

/** Neon Auth data joined into the admin views. */
export interface AuthData {
  email: string | null;
  name: string | null;
  signupAt: string | null;
}

/** A row in the admin users list. */
export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  tier: SubscriptionTier;
  appRole: AppRole | null;
  profilePublic: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  auth: AuthData | null;
  _count: { entries: number; reviews: number; lists: number };
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
  actor: { username: string; displayName: string | null };
}

/** Full admin detail for one user (GET /admin/users/:id). */
export interface AdminUserDetail {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  tier: SubscriptionTier;
  appRole: AppRole | null;
  profilePublic: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  auth: AuthData | null;
  auditLog: AdminAuditEntry[];
  _count: {
    entries: number;
    reviews: number;
    ratings: number;
    lists: number;
    followers: number;
    following: number;
  };
}
