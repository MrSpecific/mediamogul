import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  Film,
  Headphones,
  type LucideIcon,
  Newspaper,
  PauseCircle,
  PlayCircle,
  Tv,
} from "lucide-react";
import type { EntryStatus, MediaType } from "./types";

/** Lucide icon per media type — replaces the emoji glyphs in the UI. */
export const MEDIA_TYPE_ICONS: Record<MediaType, LucideIcon> = {
  MOVIE: Film,
  TV_SHOW: Tv,
  BOOK: BookOpen,
  AUDIOBOOK: Headphones,
  MAGAZINE: Newspaper,
};

/** Lucide icon per consumption status. */
export const STATUS_ICONS: Record<EntryStatus, LucideIcon> = {
  PLANNED: CalendarClock,
  IN_PROGRESS: PlayCircle,
  ON_HOLD: PauseCircle,
  COMPLETED: CheckCircle2,
  ABANDONED: CircleSlash,
};
