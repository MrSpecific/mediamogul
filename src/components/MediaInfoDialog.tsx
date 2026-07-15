import { Badge, Button, Dialog, Flex, Heading, Text } from "@wlcr/base-ic";
import { ExternalLink, Plus } from "lucide-react";
import { Cover } from "./Cover";
import { MediaTypeBadge } from "./MediaTypeBadge";
import { primaryByline } from "../lib/byline";
import type { MediaCandidate } from "../lib/types";

interface Props {
  candidate: MediaCandidate | null;
  onOpenChange: (open: boolean) => void;
  /** Add this candidate to the catalog. */
  onAdd: () => void;
  adding: boolean;
  /** Catalog id if it already exists / was just added (shows "View" instead). */
  existingId?: string | null;
  onView?: (id: string) => void;
}

/** Full details for a search result, with an add (or view) action. Opened from
 *  the result's title or info button on the Add media page. */
export function MediaInfoDialog({
  candidate,
  onOpenChange,
  onAdd,
  adding,
  existingId,
  onView,
}: Props) {
  const c = candidate;
  const by = c ? primaryByline(c.type, c.credits) : null;
  const description = c?.synopsis || c?.shortDescription;

  return (
    <Dialog
      open={c !== null}
      onOpenChange={onOpenChange}
      size="large"
      title={c?.title ?? "Details"}
      content={
        c && (
          <Flex gap="4" align="start" wrap="wrap">
            <div style={{ width: 120, flex: "none" }}>
              <Cover type={c.type} title={c.title} src={c.coverImageUrl} />
            </div>
            <Flex direction="column" gap="2" style={{ flex: "1 1 260px", minWidth: 0 }}>
              <Flex gap="2" align="center" wrap="wrap">
                <MediaTypeBadge type={c.type} />
                {c.releaseDate && (
                  <Text size="2" color="gray">
                    {c.releaseDate.slice(0, 4)}
                  </Text>
                )}
                {existingId && (
                  <Badge size="1" variant="soft" color="green">
                    In catalog
                  </Badge>
                )}
              </Flex>
              {c.subtitle && (
                <Text size="2" color="gray">
                  {c.subtitle}
                </Text>
              )}
              {by && (
                <Text size="2">
                  {by.prefix ? `${by.prefix} ` : ""}
                  {by.names.join(", ")}
                </Text>
              )}
              <Flex gap="3" wrap="wrap">
                {c.publisher && <Fact label="Publisher" value={c.publisher} />}
                {c.pageCount != null && <Fact label="Pages" value={String(c.pageCount)} />}
                {c.runtimeMinutes != null && (
                  <Fact label="Runtime" value={`${c.runtimeMinutes} min`} />
                )}
                {c.seasons != null && <Fact label="Seasons" value={String(c.seasons)} />}
                {c.episodes != null && <Fact label="Episodes" value={String(c.episodes)} />}
              </Flex>
              {description && (
                <Text size="2" className="media-description-content">
                  {description}
                </Text>
              )}
              {c.wikipediaUrl && (
                <a
                  href={c.wikipediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ext-link"
                >
                  <ExternalLink size={14} aria-hidden /> Wikipedia
                </a>
              )}
            </Flex>
          </Flex>
        )
      }
      footer={
        c && (
          <Flex justify="flex-end" gap="2">
            <Button variant="soft" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {existingId ? (
              <Button color="gray" onClick={() => onView?.(existingId)}>
                <ExternalLink size={16} aria-hidden /> View in catalog
              </Button>
            ) : (
              <Button color="green" loading={adding} onClick={onAdd}>
                <Plus size={16} aria-hidden /> Add to catalog
              </Button>
            )}
          </Flex>
        )
      }
    >
      <span style={{ display: "none" }} aria-hidden />
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        {label}
      </Text>
      <Text size="2">{value}</Text>
    </Flex>
  );
}
