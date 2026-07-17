import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Flex,
  Heading,
  Input,
  Text,
  Textarea,
  Toggle,
  ToggleGroup,
} from "@wlcr/base-ic";
import {
  Check,
  GripVertical,
  NotebookPen,
  Pencil,
  Users,
  X,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { revalidateMyLists } from "../lib/lists";
import { MediaCard } from "../components/MediaCard";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { MediaPicker } from "../components/MediaPicker";
import { SegmentedControl } from "../components/SegmentedControl";
import { StarButton } from "../components/StarButton";
import { ManageCollaboratorsDialog } from "../components/ManageCollaboratorsDialog";
import { ListIconPicker } from "../components/ListIconPicker";
import { ListIcon } from "../components/ListIcon";
import { VISIBILITY_OPTIONS } from "../lib/visibility";
import {
  MEDIA_TYPES,
  type ListDetail,
  type MediaItem,
  type MediaType,
  type Visibility,
} from "../lib/types";

/** One draggable list item. The drag handle overlays the cover's top-left; the
 *  caller supplies the card + any other overlays as children. */
function SortableListItem({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 3 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="list-item">
      <div className="list-item-overlay list-item-overlay-left">
        <button
          type="button"
          className="list-item-action list-item-drag"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}

/** Owner-editable "why it's on the list" note. Saving upserts via the same
 *  add-item endpoint (keyed by mediaItemId), so it both adds and edits. */
function ListItemNote({
  listId,
  mediaItemId,
  note,
  onSaved,
}: {
  listId: string;
  mediaItemId: string;
  note: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiSend("POST", `/lists/${listId}/items`, {
        mediaItemId,
        note: value.trim() || undefined,
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <Flex direction="column" gap="1">
        <Textarea
          rows={2}
          placeholder="Why is this on the list?"
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
        <Flex gap="2">
          <Button size="1" loading={saving} onClick={() => void save()}>
            Save
          </Button>
          <Button
            size="1"
            variant="soft"
            color="gray"
            onClick={() => {
              setValue(note ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </Flex>
      </Flex>
    );
  }

  return note ? (
    <Flex direction="column" gap="1" align="start">
      <Text size="1" color="gray" style={{ fontStyle: "italic" }}>
        “{note}”
      </Text>
      <Button size="1" variant="ghost" onClick={() => setEditing(true)}>
        <NotebookPen size={12} aria-hidden /> Edit note
      </Button>
    </Flex>
  ) : (
    <Button size="1" variant="ghost" onClick={() => setEditing(true)}>
      <NotebookPen size={12} aria-hidden /> Add note
    </Button>
  );
}

export function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, reload, setData } = useApiData<ListDetail>(
    id ? `/lists/${id}` : null,
  );
  const [manageOpen, setManageOpen] = useState(false);
  // Edit-list dialog (owner only).
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [editVis, setEditVis] = useState<Visibility>("PRIVATE");
  const [editTypes, setEditTypes] = useState<MediaType[]>([]);
  const [editRanked, setEditRanked] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Feedback for the add-media search.
  const [addMsg, setAddMsg] = useState<string | null>(null);
  // Drag sensors: a small pointer threshold so clicks (open / remove) still work.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (!data) return <Text color="gray">Loading…</Text>;

  const toggleSave = async () => {
    await apiSend(data.isSaved ? "DELETE" : "PUT", `/lists/${id}/save`);
    reload();
    void revalidateMyLists();
  };
  const openEdit = () => {
    setEditTitle(data.title);
    setEditDesc(data.description ?? "");
    setEditIcon(data.icon);
    setEditVis(data.visibility);
    setEditTypes(data.allowedTypes);
    setEditRanked(data.ranked);
    setEditOpen(true);
  };
  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setSavingEdit(true);
    try {
      await apiSend("PATCH", `/lists/${id}`, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        icon: editIcon,
        visibility: editVis,
        allowedTypes: editTypes,
        ranked: editRanked,
      });
      setEditOpen(false);
      reload();
      void revalidateMyLists();
    } finally {
      setSavingEdit(false);
    }
  };
  // Reorder items on drag: optimistically reshuffle, persist the new order,
  // and re-fetch on failure to snap back to the server's truth.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = data.items.findIndex((it) => it.id === active.id);
    const newIndex = data.items.findIndex((it) => it.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(data.items, oldIndex, newIndex);
    setData({ ...data, items: reordered });
    const order = reordered.map((it) => it.mediaItem.id);
    void apiSend("PUT", `/lists/${id}/order`, { order })
      .then(() => revalidateMyLists())
      .catch(() => reload());
  };
  const addMedia = async (media: MediaItem) => {
    setAddMsg(null);
    try {
      await apiSend("POST", `/lists/${id}/items`, { mediaItemId: media.id });
      setAddMsg(`Added “${media.title}”.`);
      reload();
      void revalidateMyLists();
    } catch (e) {
      const err = (e as Error).message;
      setAddMsg(
        err === "type_not_allowed"
          ? "That media type isn't allowed on this list."
          : err,
      );
    }
  };
  const remove = async (itemId: string) => {
    await apiSend("DELETE", `/lists/${id}/items/${itemId}`);
    reload();
    void revalidateMyLists();
  };
  const respondInvite = async (accept: boolean) => {
    await apiSend("POST", `/lists/${id}/collaboration/respond`, { accept });
    reload();
  };
  const acceptedCollaborators = data.collaborators.filter(
    (x) => x.status === "ACCEPTED",
  );
  const pendingCount = data.collaborators.filter(
    (x) => x.status === "PENDING",
  ).length;
  const showCollaborators = data.isOwner || acceptedCollaborators.length > 0;

  return (
    <Flex direction="column" gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Flex direction="column" gap="2">
          <Flex gap="2" align="center">
            <ListIcon handle={data.icon} size={26} />
            <Heading size="7">{data.title}</Heading>
          </Flex>
          {data.description && <Text color="gray">{data.description}</Text>}
          <Flex gap="2" wrap="wrap" align="center">
            <Badge variant="soft">
              {
                VISIBILITY_OPTIONS.find(
                  (option) =>
                    option.value.toLowerCase() ===
                    data.visibility.toLowerCase(),
                )?.label
              }
            </Badge>
            {data.allowedTypes.length ? (
              data.allowedTypes.map((t) => <MediaTypeBadge key={t} type={t} />)
            ) : (
              <Badge variant="outline">Any type</Badge>
            )}
            {data.owner && (
              <Text size="1" color="gray">
                by{" "}
                <Link
                  to={`/u/${data.owner.username}`}
                  className="byline-link"
                >
                  @{data.owner.username}
                </Link>
              </Text>
            )}
          </Flex>
        </Flex>
        <Flex gap="2" align="center">
          {data.isOwner && (
            <Button variant="soft" color="gray" onClick={openEdit}>
              <Pencil size={14} aria-hidden /> Edit list
            </Button>
          )}
          <StarButton
            listId={data.id}
            starred={data.isStarred}
            size="2"
            withLabel
            onChange={reload}
          />
          {!data.isOwner && (
            <Button
              variant={data.isSaved ? "soft" : "solid"}
              onClick={() => void toggleSave()}
            >
              {data.isSaved ? "Saved" : "Save"}
            </Button>
          )}
        </Flex>
      </Flex>

      {data.myCollabStatus === "PENDING" && (
        <Card size="2">
          <Flex justify="space-between" align="center" gap="3" wrap="wrap">
            <Text size="2">
              You've been invited to collaborate on this list.
            </Text>
            <Flex gap="2">
              <Button size="1" onClick={() => void respondInvite(true)}>
                <Check size={14} aria-hidden /> Accept
              </Button>
              <Button
                size="1"
                variant="soft"
                color="gray"
                onClick={() => void respondInvite(false)}
              >
                <X size={14} aria-hidden /> Decline
              </Button>
            </Flex>
          </Flex>
        </Card>
      )}

      {showCollaborators && (
        <Card size="2">
          <Flex direction="column" gap="2">
            <Flex justify="space-between" align="center" gap="2" wrap="wrap">
              <Text weight="medium">Collaborators</Text>
              {data.isOwner && (
                <Button
                  size="1"
                  variant="soft"
                  onClick={() => setManageOpen(true)}
                >
                  <Users size={14} aria-hidden /> Manage collaborators
                </Button>
              )}
            </Flex>
            {acceptedCollaborators.length === 0 ? (
              <Text size="1" color="gray">
                {data.isOwner
                  ? "No collaborators yet — invite someone to co-edit."
                  : "No collaborators yet."}
              </Text>
            ) : (
              <Flex gap="2" wrap="wrap">
                {acceptedCollaborators.map((col) => (
                  <Badge key={col.userId} variant="soft" color="gray">
                    @{col.user.username}
                  </Badge>
                ))}
              </Flex>
            )}
            {data.isOwner && pendingCount > 0 && (
              <Text size="1" color="gray">
                {pendingCount} pending invitation{pendingCount === 1 ? "" : "s"}
              </Text>
            )}
          </Flex>
        </Card>
      )}

      {data.isOwner && (
        <ManageCollaboratorsDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          listId={data.id}
          collaborators={data.collaborators}
          onChanged={reload}
        />
      )}

      {data.items.length === 0 && (
        <Text color="gray">
          {data.canEdit
            ? "Empty list — search above or add items from any media page."
            : "Empty list."}
        </Text>
      )}
      {data.canEdit ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={data.items.map((it) => it.id)}
            strategy={rectSortingStrategy}
          >
            <div className="media-grid">
              {data.items.map((it) => (
                <SortableListItem key={it.id} id={it.id}>
                  <div className="list-item-overlay list-item-overlay-right">
                    <button
                      type="button"
                      className="list-item-action"
                      aria-label="Remove from list"
                      title="Remove from list"
                      onClick={() => void remove(it.id)}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </div>
                  <Flex direction="column" gap="1">
                    <MediaCard item={it.mediaItem} />
                    <ListItemNote
                      listId={data.id}
                      mediaItemId={it.mediaItem.id}
                      note={it.note}
                      onSaved={reload}
                    />
                  </Flex>
                </SortableListItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="media-grid">
          {data.items.map((it) => (
            <Flex direction="column" gap="1" key={it.id}>
              <MediaCard item={it.mediaItem} />
              {it.note && (
                <Text size="1" color="gray" style={{ fontStyle: "italic" }}>
                  “{it.note}”
                </Text>
              )}
            </Flex>
          ))}
        </div>
      )}

      {data.canEdit && (
        <Card size="2">
          <Flex direction="column" gap="2">
            <Text weight="medium">Add to this list</Text>
            <Text size="1" color="gray">
              Search the catalog and add a title.
            </Text>
            <MediaPicker onPick={(m) => void addMedia(m)} />
            {addMsg && (
              <Text size="1" color="gray">
                {addMsg}
              </Text>
            )}
          </Flex>
        </Card>
      )}

      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit list"
        content={
          <Flex
            as="form"
            direction="column"
            gap="3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <Field label="Title">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.currentTarget.value)}
                placeholder="List title"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.currentTarget.value)}
                placeholder="What's this list about?"
                rows={3}
              />
            </Field>
            <Field label="Icon">
              <ListIconPicker value={editIcon} onChange={setEditIcon} />
            </Field>
            <Field label="Visibility">
              <SegmentedControl
                ariaLabel="List visibility"
                value={editVis}
                onChange={setEditVis}
                options={VISIBILITY_OPTIONS}
              />
            </Field>
            <Field label="Allowed types">
              <Flex direction="column" gap="1" align="start">
                <ToggleGroup
                  multiple
                  value={editTypes}
                  onValueChange={(v: unknown[]) =>
                    setEditTypes(v as MediaType[])
                  }
                >
                  {MEDIA_TYPES.map((t) => (
                    <Toggle key={t.value} value={t.value}>
                      {t.label}
                    </Toggle>
                  ))}
                </ToggleGroup>
                <Text size="1" color="gray">
                  {editTypes.length
                    ? "Only these types can be added."
                    : "Any media type can be added."}
                </Text>
              </Flex>
            </Field>
            <Field label="Ordering">
              <SegmentedControl
                ariaLabel="List ordering"
                value={editRanked ? "ranked" : "unordered"}
                onChange={(v) => setEditRanked(v === "ranked")}
                options={[
                  { value: "unordered", label: "Unordered" },
                  { value: "ranked", label: "Ranked" },
                ]}
              />
            </Field>
          </Flex>
        }
        footer={
          <Flex gap="2" justify="end">
            <Button
              variant="soft"
              color="gray"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              loading={savingEdit}
              disabled={!editTitle.trim()}
              onClick={() => void saveEdit()}
            >
              Save
            </Button>
          </Flex>
        }
      >
        {/* Controlled via `open`; the trigger is required by the API but unused.
            Must be a real <button> — Base UI's Trigger expects native button
            semantics. */}
        <button type="button" style={{ display: "none" }} aria-hidden />
      </Dialog>
    </Flex>
  );
}
