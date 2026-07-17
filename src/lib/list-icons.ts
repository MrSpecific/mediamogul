import {
  Award,
  BookOpen,
  Bookmark,
  Clapperboard,
  Clock,
  Coffee,
  Compass,
  Crown,
  Eye,
  Feather,
  Film,
  Flame,
  Gamepad2,
  Ghost,
  Gift,
  Globe,
  Headphones,
  Heart,
  Library,
  List,
  ListChecks,
  Moon,
  Music,
  Popcorn,
  Rocket,
  Skull,
  Sparkles,
  Star,
  Sun,
  Trophy,
  Tv,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Curated set of list icons. The DB stores only the string `handle`; the UI
 * resolves it to a component (see components/ListIcon.tsx). Keep handles stable
 * — they're persisted.
 */
export const LIST_ICONS: { handle: string; label: string; Icon: LucideIcon }[] =
  [
    { handle: "list", label: "List", Icon: List },
    { handle: "list-checks", label: "Checklist", Icon: ListChecks },
    { handle: "library", label: "Library", Icon: Library },
    { handle: "eye", label: "Watchlist", Icon: Eye },
    { handle: "coffee", label: "Cozy", Icon: Coffee },
    { handle: "star", label: "Star", Icon: Star },
    { handle: "heart", label: "Heart", Icon: Heart },
    { handle: "bookmark", label: "Bookmark", Icon: Bookmark },
    { handle: "trophy", label: "Trophy", Icon: Trophy },
    { handle: "award", label: "Award", Icon: Award },
    { handle: "crown", label: "Crown", Icon: Crown },
    { handle: "flame", label: "Flame", Icon: Flame },
    { handle: "sparkles", label: "Sparkles", Icon: Sparkles },
    { handle: "zap", label: "Zap", Icon: Zap },
    { handle: "film", label: "Film", Icon: Film },
    { handle: "clapperboard", label: "Clapperboard", Icon: Clapperboard },
    { handle: "popcorn", label: "Popcorn", Icon: Popcorn },
    { handle: "tv", label: "TV", Icon: Tv },
    { handle: "book-open", label: "Book", Icon: BookOpen },
    { handle: "headphones", label: "Headphones", Icon: Headphones },
    { handle: "music", label: "Music", Icon: Music },
    { handle: "gamepad", label: "Games", Icon: Gamepad2 },
    { handle: "rocket", label: "Rocket", Icon: Rocket },
    { handle: "ghost", label: "Ghost", Icon: Ghost },
    { handle: "skull", label: "Skull", Icon: Skull },
    { handle: "compass", label: "Compass", Icon: Compass },
    { handle: "globe", label: "Globe", Icon: Globe },
    { handle: "feather", label: "Feather", Icon: Feather },
    { handle: "gift", label: "Gift", Icon: Gift },
    { handle: "sun", label: "Sun", Icon: Sun },
    { handle: "moon", label: "Moon", Icon: Moon },
    { handle: "clock", label: "Clock", Icon: Clock },
  ];

/** Every valid icon handle. */
export const LIST_ICON_HANDLES = LIST_ICONS.map((i) => i.handle);

/** handle → icon component, for O(1) lookup when rendering. */
export const LIST_ICON_BY_HANDLE: Record<string, LucideIcon> =
  Object.fromEntries(LIST_ICONS.map((i) => [i.handle, i.Icon]));
