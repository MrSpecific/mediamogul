import type { CSSProperties } from "react";
import { Badge } from "@wlcr/base-ic";
import { MEDIA_FIELDS } from "../../shared/media-fields";
import { MEDIA_TYPE_ICONS } from "../lib/icons";
import type { MediaType } from "../lib/types";

interface Props {
  type: MediaType;
  size?: "1" | "2" | "3";
  style?: CSSProperties;
}

const ICON_SIZE: Record<"1" | "2" | "3", number> = { 1: 12, 2: 14, 3: 16 };

/** Displays a media type as a colored, icon-prefixed badge (config-driven). */
export function MediaTypeBadge({ type, size = "1", style }: Props) {
  const cfg = MEDIA_FIELDS[type];
  const Icon = MEDIA_TYPE_ICONS[type];
  return (
    <Badge color={cfg.color} variant="soft" size={size} style={style}>
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <Icon size={ICON_SIZE[size]} aria-hidden />
        {cfg.label}
      </span>
    </Badge>
  );
}
