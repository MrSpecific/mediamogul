import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Flex,
  Heading,
  Input,
  Text,
  Textarea,
} from "@wlcr/base-ic";
import { Check, NotebookPen, UserPlus, X } from "lucide-react";
import { useApiData } from "../lib/hooks";
import { apiSend, ApiError } from "../lib/api";
import { MediaCard } from "../components/MediaCard";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { StarButton } from "../components/StarButton";
import { VISIBILITY_OPTIONS } from "../lib/visibility";
import type { ListDetail } from "../lib/types";

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
  const { data, reload } = useApiData<ListDetail>(id ? `/lists/${id}` : null);
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  if (!data) return <Text color="gray">Loading…</Text>;

  const toggleSave = async () => {
    await apiSend(data.isSaved ? "DELETE" : "PUT", `/lists/${id}/save`);
    reload();
  };
  const remove = async (itemId: string) => {
    await apiSend("DELETE", `/lists/${id}/items/${itemId}`);
    reload();
  };
  const invite = async () => {
    const uname = inviteName.trim().replace(/^@/, "");
    if (!uname) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      await apiSend("POST", `/lists/${id}/invite`, { username: uname });
      setInviteName("");
      setInviteMsg(`Invited @${uname}.`);
      reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "failed";
      setInviteMsg(
        code === "user_not_found"
          ? "No user with that username."
          : code === "already_collaborator"
            ? "They're already a collaborator."
            : code === "cannot_invite_self"
              ? "You can't invite yourself."
              : "Couldn't send the invite.",
      );
    } finally {
      setInviting(false);
    }
  };
  const respondInvite = async (accept: boolean) => {
    await apiSend("POST", `/lists/${id}/collaboration/respond`, { accept });
    reload();
  };
  const removeCollaborator = async (userId: string) => {
    await apiSend("DELETE", `/lists/${id}/collaborators/${userId}`);
    reload();
  };
  const acceptedCollaborators = data.collaborators.filter(
    (x) => x.status === "ACCEPTED",
  );
  const showCollaborators = data.isOwner || acceptedCollaborators.length > 0;

  return (
    <Flex direction="column" gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Flex direction="column" gap="2">
          <Heading size="7">{data.title}</Heading>
          {data.description && <Text color="gray">{data.description}</Text>}
          <Flex gap="2" wrap="wrap">
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
          </Flex>
        </Flex>
        <Flex gap="2" align="center">
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
            <Text weight="medium">Collaborators</Text>
            {data.collaborators.length === 0 && (
              <Text size="1" color="gray">
                No collaborators yet — invite someone below.
              </Text>
            )}
            {(data.isOwner ? data.collaborators : acceptedCollaborators).map(
              (col) => (
                <Flex key={col.userId} justify="space-between" align="center">
                  <Text size="2">
                    @{col.user.username}
                    {col.status === "PENDING" && (
                      <Badge
                        size="1"
                        variant="soft"
                        color="gray"
                        style={{ marginLeft: 6 }}
                      >
                        pending
                      </Badge>
                    )}
                  </Text>
                  {data.isOwner && (
                    <Button
                      size="1"
                      variant="ghost"
                      color="red"
                      onClick={() => void removeCollaborator(col.userId)}
                    >
                      Remove
                    </Button>
                  )}
                </Flex>
              ),
            )}
            {data.isOwner && (
              <Flex
                as="form"
                gap="2"
                align="center"
                onSubmit={(e) => {
                  e.preventDefault();
                  void invite();
                }}
              >
                <Input
                  wrapperClassName="grow"
                  placeholder="Invite by @username"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.currentTarget.value)}
                />
                <Button
                  type="submit"
                  size="1"
                  loading={inviting}
                  disabled={!inviteName.trim()}
                >
                  <UserPlus size={14} aria-hidden /> Invite
                </Button>
              </Flex>
            )}
            {inviteMsg && (
              <Text size="1" color="gray">
                {inviteMsg}
              </Text>
            )}
          </Flex>
        </Card>
      )}

      {data.items.length === 0 && (
        <Text color="gray">Empty list — add items from any media page.</Text>
      )}
      <div className="media-grid">
        {data.items.map((it) => (
          <Flex direction="column" gap="1" key={it.id}>
            <MediaCard item={it.mediaItem} />
            {data.canEdit ? (
              <ListItemNote
                listId={data.id}
                mediaItemId={it.mediaItem.id}
                note={it.note}
                onSaved={reload}
              />
            ) : (
              it.note && (
                <Text size="1" color="gray" style={{ fontStyle: "italic" }}>
                  “{it.note}”
                </Text>
              )
            )}
            {data.canEdit && (
              <Button
                size="1"
                variant="ghost"
                onClick={() => void remove(it.id)}
              >
                Remove
              </Button>
            )}
          </Flex>
        ))}
      </div>
    </Flex>
  );
}
