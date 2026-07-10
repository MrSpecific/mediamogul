import type { CSSProperties } from "react";
import { Badge } from "@wlcr/base-ic";
import { MEDIA_FIELDS } from "../../shared/media-fields";
import type { MediaType } from "../lib/types";

interface Props {
  type: MediaType;
  size?: "1" | "2" | "3";
  style?: CSSProperties;
}

/** Displays a media type as a colored, icon-prefixed badge (config-driven). */
export function MediaTypeBadge({ type, size = "1", style }: Props) {
  const cfg = MEDIA_FIELDS[type];
  return (
    <Badge color={cfg.color} variant="soft" size={size} style={style}>
      <span aria-hidden style={{ marginRight: 4 }}>
        {cfg.icon}
      </span>
      {cfg.label}
    </Badge>
  );
}
