import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const cfg = MEDIA_FIELDS[type];
  const Icon = MEDIA_TYPE_ICONS[type];

  const openType = () => navigate(`/catalog?types=${encodeURIComponent(type)}`);
  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    // Badges are sometimes nested in a card that links to the media detail.
    // Keep this click on the type filter instead of activating the card link.
    event.preventDefault();
    event.stopPropagation();
    openType();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    openType();
  };

  return (
    <span
      role="link"
      tabIndex={0}
      aria-label={`View ${cfg.label} in catalog`}
      className="media-type-badge-link"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={style}
    >
      <Badge color={cfg.color} variant="soft" size={size}>
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <Icon size={ICON_SIZE[size]} aria-hidden />
          {cfg.label}
        </span>
      </Badge>
    </span>
  );
}
