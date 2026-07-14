import { Badge } from "@wlcr/base-ic";
import { Star, Trash2 } from "lucide-react";
import { Cover } from "./Cover";
import type { MediaType } from "../lib/types";

export interface CoverInfo {
  id: string;
  url: string;
  isPrimary?: boolean;
}

/** Owner/admin controls; omit for the read-only (regular user + public) view. */
interface AdminControls {
  busyId: string | null;
  onSetPrimary: (id: string) => void;
  onRemove: (id: string) => void;
}

interface Props {
  type: MediaType;
  title: string;
  covers: CoverInfo[];
  /** Class for the large primary cover (e.g. "detail-cover"). */
  className?: string;
  admin?: AdminControls;
}

/**
 * Shared cover display for every view (regular user, admin, public). Shows the
 * primary cover large plus a thumbnail strip of the rest, all via `Cover` so
 * the generated placeholders/fallbacks are identical everywhere. Passing
 * `admin` adds set-primary/delete controls to each thumbnail.
 */
export function CoverGallery({ type, title, covers, className, admin }: Props) {
  // Be resilient about order even if the server didn't sort primary-first.
  const ordered = [...covers].sort(
    (a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)),
  );
  const primary = ordered[0];
  // Read view: primary is already shown large, so thumbs are the extras only.
  // Admin view: show every cover so the primary can be re-picked or removed.
  const thumbs = admin ? ordered : ordered.slice(1);

  return (
    <div className="cover-gallery">
      <Cover
        type={type}
        title={title}
        src={primary?.url ?? null}
        className={className}
      />

      {thumbs.length > 0 && (
        <div className="cover-gallery-thumbs">
          {thumbs.map((cv) => (
            <div
              key={cv.id}
              className={`cover-gallery-item${cv.isPrimary ? " is-primary" : ""}`}
            >
              <Cover type={type} title={title} src={cv.url} />
              {admin && (
                <div className="cover-thumb-actions">
                  {!cv.isPrimary && (
                    <button
                      type="button"
                      title="Make primary"
                      disabled={admin.busyId === cv.id}
                      onClick={() => admin.onSetPrimary(cv.id)}
                    >
                      <Star size={13} aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Delete cover"
                    disabled={admin.busyId === cv.id}
                    onClick={() => admin.onRemove(cv.id)}
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              )}
              {admin && cv.isPrimary && (
                <Badge className="cover-thumb-badge" size="1" color="green">
                  Primary
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
