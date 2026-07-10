import type { CSSProperties } from "react";
import { Badge } from "@wlcr/base-ic";
import { mediaTypeLabel, type MediaType } from "../lib/types";

// Icon + semantic accent color per media type (base-ic AccentColor names).
const CONFIG: Record<MediaType, { icon: string; color: string }> = {
  MOVIE: { icon: "🎬", color: "red" },
  TV_SHOW: { icon: "📺", color: "violet" },
  BOOK: { icon: "📖", color: "amber" },
  MAGAZINE: { icon: "📰", color: "teal" },
};

interface Props {
  type: MediaType;
  size?: "1" | "2" | "3";
  style?: CSSProperties;
}

/** Displays a media type as a colored, icon-prefixed badge. */
export function MediaTypeBadge({ type, size = "1", style }: Props) {
  const { icon, color } = CONFIG[type];
  return (
    <Badge color={color} variant="soft" size={size} style={style}>
      <span aria-hidden style={{ marginRight: 4 }}>
        {icon}
      </span>
      {mediaTypeLabel(type)}
    </Badge>
  );
}
