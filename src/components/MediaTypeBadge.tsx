import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@wlcr/base-ic";
import { MEDIA_FIELDS } from "../../shared/media-fields";
import { MEDIA_TYPE_ICONS } from "../lib/icons";
import type { MediaType } from "../lib/types";

interface Props {
  type: MediaType;
  size?: "1" | "2" | "3";
  style?: CSSProperties;
  linkToCatalog?: boolean;
}

const ICON_SIZE: Record<"1" | "2" | "3", number> = { 1: 12, 2: 14, 3: 16 };

/** Displays a media type as a colored, icon-prefixed badge (config-driven). */
export function MediaTypeBadge({
  type,
  size = "1",
  style,
  linkToCatalog = true,
}: Props) {
  const cfg = MEDIA_FIELDS[type];
  const Icon = MEDIA_TYPE_ICONS[type];
  const badge = (
    <Badge
      color={cfg.color}
      variant="soft"
      size={size}
      style={linkToCatalog ? undefined : style}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon size={ICON_SIZE[size]} aria-hidden />
        {cfg.label}
      </span>
    </Badge>
  );

  if (!linkToCatalog) return badge;

  return (
    <Link
      to={`/catalog?types=${encodeURIComponent(type)}`}
      aria-label={`View ${cfg.label} in catalog`}
      className="media-type-badge-link"
      style={style}
    >
      {badge}
    </Link>
  );
}
