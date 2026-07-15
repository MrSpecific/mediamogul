import { useState } from "react";
import { MEDIA_TYPE_ICONS } from "../lib/icons";
import type { MediaType } from "../lib/types";

interface Props {
  type: MediaType;
  title: string;
  src?: string | null;
  /** Extra class on the wrapper (e.g. "detail-cover"). */
  className?: string;
  /** Drop the title from the generated fallback (for small thumbnails). */
  hideTitle?: boolean;
}

// Muted per-type background tints (work on the dark theme).
const TYPE_TINT: Record<MediaType, string> = {
  MOVIE: "#4a1f22",
  TV_SHOW: "#2f2551",
  BOOK: "#463813",
  AUDIOBOOK: "#123a30",
  MAGAZINE: "#0f3a3a",
};

/** The real image; fades in on load, removes itself on error. Keyed by src so
 *  load state resets when the source changes (no effect needed). */
function CoverImg({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`cover-art-img${loaded ? " loaded" : ""}`}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Cover artwork with a generated CSS fallback (media-type icon + title). The
 * fallback also shows while the real image loads, and if it fails to load.
 */
export function Cover({ type, title, src, className, hideTitle }: Props) {
  const Icon = MEDIA_TYPE_ICONS[type];
  return (
    <div className={`cover-art${className ? ` ${className}` : ""}`}>
      <div
        className="cover-art-fallback"
        style={{
          background: `linear-gradient(155deg, ${TYPE_TINT[type]}, #14141a)`,
        }}
        aria-hidden
      >
        <Icon className="cover-art-icon" />
        {!hideTitle && <span className="cover-art-title">{title}</span>}
      </div>
      {src && <CoverImg key={src} src={src} />}
    </div>
  );
}
