import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Card, Flex, Heading, Text } from "@wlcr/base-ic";
import { ChevronDown, ChevronUp, ListPlus, Shield, Trash2 } from "lucide-react";
import { useApiData } from "../lib/hooks";
import { useAdminMode } from "../lib/admin-mode";
import { apiSend } from "../lib/api";
import { primaryByline } from "../lib/byline";
import { Cover } from "../components/Cover";
import { MediaPicker } from "../components/MediaPicker";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { AddToListDialog } from "../components/AddToListDialog";
import type { Credit, MediaItem, Profile } from "../lib/types";

type SeriesMediaItem = MediaItem & { credits?: Credit[] };

interface SeriesDetail {
  id: string;
  title: string;
  description: string | null;
  entries: { position: number; mediaItem: SeriesMediaItem }[];
}

export function SeriesPage() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = useApiData<SeriesDetail>(
    id ? `/series/${id}` : null,
  );
  const { data: me } = useApiData<Profile>("/me");
  const isAdmin = Boolean(me?.isAdmin);

  const [adminMode, setAdminMode] = useAdminMode();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Media id whose "Add to list" dialog is open (one dialog, reused per entry).
  const [listDialogFor, setListDialogFor] = useState<string | null>(null);

  // Admin affordances only render when an admin flips into admin mode.
  const showAdmin = isAdmin && adminMode;

  if (!data) return <Text color="gray">Loading…</Text>;

  // Next free position = one past the current highest, so admins can add
  // without picking a number themselves.
  const nextPosition =
    data.entries.reduce((max, e) => Math.max(max, e.position), 0) + 1;
  const inSeries = new Set(data.entries.map((e) => e.mediaItem.id));

  const addItem = async (media: MediaItem) => {
    if (inSeries.has(media.id)) {
      setMsg(`${media.title} is already in this series.`);
      return;
    }
    setAddingId(media.id);
    setMsg(null);
    try {
      await apiSend("POST", `/series/${data.id}/items`, {
        mediaItemId: media.id,
        position: nextPosition,
      });
      setMsg(`Added ${media.title}.`);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setAddingId(null);
    }
  };

  const removeItem = async (mediaItemId: string) => {
    setRemovingId(mediaItemId);
    try {
      await apiSend("DELETE", `/series/${data.id}/items/${mediaItemId}`);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setRemovingId(null);
    }
  };

  // Move the entry at `index` one slot up (dir -1) or down (dir +1) by
  // sending the whole reordered list of ids to the server.
  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= data.entries.length) return;
    const ids = data.entries.map((e) => e.mediaItem.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setReordering(true);
    setMsg(null);
    try {
      await apiSend("PUT", `/series/${data.id}/order`, { order: ids });
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setReordering(false);
    }
  };

  return (
    <Flex direction="column" gap="4">
      {isAdmin && (
        <Flex justify="end" align="center" gap="2">
          <Text size="1" color="gray">
            {adminMode ? "Editing as admin" : ""}
          </Text>
          <Button
            size="1"
            variant={adminMode ? "solid" : "soft"}
            color={adminMode ? "amber" : "gray"}
            onClick={() => setAdminMode((v) => !v)}
          >
            <Shield size={14} aria-hidden />
            {adminMode ? "Admin mode: on" : "Admin mode"}
          </Button>
        </Flex>
      )}

      <Flex direction="column" gap="1">
        <Text size="1" color="gray">
          Series
        </Text>
        <Heading size="7">{data.title}</Heading>
        {data.description && <Text color="gray">{data.description}</Text>}
      </Flex>

      <Flex direction="column" gap="2">
        {data.entries.map(({ position, mediaItem }, index) => (
          <Flex key={mediaItem.id} gap="2" align="center">
            {showAdmin && (
              <Flex direction="column" gap="1" className="shrink">
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  aria-label="Move up"
                  disabled={index === 0 || reordering}
                  onClick={() => void move(index, -1)}
                >
                  <ChevronUp size={14} aria-hidden />
                </Button>
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  aria-label="Move down"
                  disabled={index === data.entries.length - 1 || reordering}
                  onClick={() => void move(index, 1)}
                >
                  <ChevronDown size={14} aria-hidden />
                </Button>
              </Flex>
            )}
            <Link
              to={`/media/${mediaItem.id}`}
              className="media-card-link grow"
            >
              <Card asButton size="2">
                <Flex gap="2" align="start" px="2">
                  <Text
                    size="5"
                    color="gray"
                    weight="bold"
                    style={{ width: 24, flex: "none" }}
                  >
                    {position}
                  </Text>
                  <div style={{ width: 44, flex: "none" }}>
                    <Cover
                      type={mediaItem.type}
                      title={mediaItem.title}
                      src={mediaItem.coverImageUrl}
                    />
                  </div>
                  <Flex
                    direction="column"
                    align="start"
                    gap="1"
                    className="shrink"
                  >
                    <Flex gap="2" align="center" wrap="wrap">
                      <MediaTypeBadge type={mediaItem.type} />
                      {mediaItem.releaseDate && (
                        <Text size="1" color="gray">
                          {mediaItem.releaseDate.slice(0, 4)}
                        </Text>
                      )}
                    </Flex>
                    <Text weight="medium" truncate>
                      {mediaItem.title}
                    </Text>
                    {mediaItem.subtitle && (
                      <Text size="1" color="gray" truncate>
                        {mediaItem.subtitle}
                      </Text>
                    )}
                    {(() => {
                      const by = primaryByline(
                        mediaItem.type,
                        mediaItem.credits,
                      );
                      if (!by) return null;
                      return (
                        <Text size="1" color="gray" truncate>
                          {by.prefix ? `${by.prefix} ` : ""}
                          {by.names.join(", ")}
                        </Text>
                      );
                    })()}
                  </Flex>
                </Flex>
              </Card>
            </Link>
            <Button
              size="1"
              variant="soft"
              color="gray"
              className="shrink"
              onClick={() => setListDialogFor(mediaItem.id)}
            >
              <ListPlus size={14} aria-hidden /> Add to list
            </Button>
            {showAdmin && (
              <Button
                size="1"
                variant="soft"
                color="red"
                loading={removingId === mediaItem.id}
                onClick={() => void removeItem(mediaItem.id)}
              >
                <Trash2 size={14} aria-hidden /> Remove
              </Button>
            )}
          </Flex>
        ))}
      </Flex>

      {showAdmin && (
        <Card size="2">
          <Flex direction="column" gap="2">
            <Text weight="medium">Add to series</Text>
            <Text size="1" color="gray">
              Search the catalog and add a title — it goes in at position{" "}
              {nextPosition}.
            </Text>
            <MediaPicker onPick={(m) => void addItem(m)} />
            {addingId && (
              <Text size="1" color="gray">
                Adding…
              </Text>
            )}
          </Flex>
        </Card>
      )}

      {msg && (
        <Text size="2" color="gray">
          {msg}
        </Text>
      )}

      {/* One dialog, reused for whichever entry's "Add to list" was clicked. */}
      {listDialogFor && (
        <AddToListDialog
          open={listDialogFor !== null}
          onOpenChange={(o) => !o && setListDialogFor(null)}
          mediaId={listDialogFor}
        />
      )}
    </Flex>
  );
}
