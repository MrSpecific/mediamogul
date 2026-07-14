import { useEffect, useState } from "react";
import { Badge, Button, Dialog, Flex, Text } from "@wlcr/base-ic";
import { ChevronLeft, ChevronRight, ExternalLink, Star, Trash2 } from "lucide-react";
import { Cover } from "./Cover";
import type { MediaType } from "../lib/types";

export interface CoverInfo {
  id: string;
  url: string;
  isPrimary?: boolean;
  edition?: string | null;
  editionYear?: number | null;
  publisher?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  license?: string | null;
  creator?: string | null;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Be resilient about order even if the server didn't sort primary-first.
  const ordered = [...covers].sort(
    (a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)),
  );
  const primary = ordered[0];
  // Read view: primary is already shown large, so thumbs are the extras only.
  // Admin view: show every cover so the primary can be re-picked or removed.
  const thumbs = admin ? ordered : ordered.slice(1);
  const selectedIndex = selectedId
    ? ordered.findIndex((cover) => cover.id === selectedId)
    : -1;
  const selected = selectedIndex >= 0 ? ordered[selectedIndex] : undefined;
  const canOpenLightbox = ordered.length > 1;

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && selectedIndex > 0) {
        setSelectedId(ordered[selectedIndex - 1].id);
      }
      if (event.key === "ArrowRight" && selectedIndex < ordered.length - 1) {
        setSelectedId(ordered[selectedIndex + 1].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ordered, selected, selectedIndex]);

  const coverButton = (cover: CoverInfo | undefined, large = false) => {
    const artwork = (
      <Cover
        type={type}
        title={title}
        src={cover?.url ?? null}
        className={large ? className : undefined}
      />
    );
    if (!cover || !canOpenLightbox) return artwork;
    return (
      <button
        type="button"
        className="cover-lightbox-trigger"
        aria-label={`View ${cover.isPrimary ? "primary " : ""}cover larger`}
        onClick={() => setSelectedId(cover.id)}
      >
        {artwork}
      </button>
    );
  };

  return (
    <div className="cover-gallery">
      {coverButton(primary, true)}

      {thumbs.length > 0 && (
        <div className="cover-gallery-thumbs">
          {thumbs.map((cv) => (
            <div
              key={cv.id}
              className={`cover-gallery-item${cv.isPrimary ? " is-primary" : ""}`}
            >
              {coverButton(cv)}
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

      <Dialog
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        size="large"
        title={`${title} cover`}
        content={selected && (
          <Flex className="cover-lightbox" gap="4" align="start" wrap="wrap">
            <div className="cover-lightbox-image-wrap">
              <img src={selected.url} alt={`${title} cover`} className="cover-lightbox-image" />
            </div>
            <Flex className="cover-lightbox-details" direction="column" gap="3">
              <Flex gap="2" wrap="wrap">
                {selected.isPrimary && <Badge color="green">Primary</Badge>}
                {selected.edition && <Badge variant="outline">{selected.edition}</Badge>}
              </Flex>
              {(selected.editionYear || selected.publisher || selected.creator || selected.license || selected.sourceName) ? (
                <Flex direction="column" gap="2">
                  {selected.editionYear && <CoverDetail label="Edition year" value={String(selected.editionYear)} />}
                  {selected.publisher && <CoverDetail label="Publisher" value={selected.publisher} />}
                  {selected.creator && <CoverDetail label="Cover credit" value={selected.creator} />}
                  {selected.license && <CoverDetail label="License" value={selected.license} />}
                  {selected.sourceName && <CoverDetail label="Source" value={selected.sourceName} />}
                </Flex>
              ) : <Text size="2" color="gray">No additional cover information is available.</Text>}
              {selected.sourceUrl && (
                <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="ext-link">
                  <ExternalLink size={14} aria-hidden /> View source
                </a>
              )}
            </Flex>
          </Flex>
        )}
        footer={selected && ordered.length > 1 ? (
          <Flex justify="space-between" align="center" gap="3">
            <Button variant="soft" disabled={selectedIndex === 0}
              onClick={() => setSelectedId(ordered[selectedIndex - 1].id)}>
              <ChevronLeft size={16} aria-hidden /> Previous
            </Button>
            <Text size="2" color="gray">{selectedIndex + 1} of {ordered.length}</Text>
            <Button variant="soft" disabled={selectedIndex === ordered.length - 1}
              onClick={() => setSelectedId(ordered[selectedIndex + 1].id)}>
              Next <ChevronRight size={16} aria-hidden />
            </Button>
          </Flex>
        ) : undefined}
      >
        <span style={{ display: "none" }} aria-hidden />
      </Dialog>
    </div>
  );
}

function CoverDetail({ label, value }: { label: string; value: string }) {
  return (
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">{label}</Text>
      <Text size="2">{value}</Text>
    </Flex>
  );
}
