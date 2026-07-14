import { useState } from "react";
import { Badge, Button, Dialog, Flex, Input, Text } from "@wlcr/base-ic";
import { UserPlus } from "lucide-react";
import { apiSend, ApiError } from "../lib/api";
import type { ListCollaborator } from "../lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  collaborators: ListCollaborator[];
  /** Refresh the parent list after any change. */
  onChanged: () => void;
}

/** Owner-only modal to invite collaborators, cancel pending invites, and
 *  remove existing collaborators. */
export function ManageCollaboratorsDialog({
  open,
  onOpenChange,
  listId,
  collaborators,
  onChanged,
}: Props) {
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invite = async () => {
    const uname = inviteName.trim().replace(/^@/, "");
    if (!uname) return;
    setInviting(true);
    setMsg(null);
    try {
      await apiSend("POST", `/lists/${listId}/invite`, { username: uname });
      setInviteName("");
      setMsg(`Invited @${uname}.`);
      onChanged();
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "failed";
      setMsg(
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

  const removeCollaborator = async (userId: string) => {
    setBusyId(userId);
    try {
      await apiSend("DELETE", `/lists/${listId}/collaborators/${userId}`);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setInviteName("");
      setMsg(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Manage collaborators"
      description="Invite people to co-edit this list, or remove them."
      content={
        <Flex direction="column" gap="3">
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
          {msg && (
            <Text size="1" color="gray">
              {msg}
            </Text>
          )}

          {collaborators.length === 0 ? (
            <Text size="1" color="gray">
              No collaborators yet.
            </Text>
          ) : (
            collaborators.map((col) => (
              <Flex key={col.userId} justify="space-between" align="center" gap="3">
                <Flex gap="2" align="center" className="shrink">
                  <Text size="2" truncate>
                    @{col.user.username}
                  </Text>
                  {col.status === "PENDING" && (
                    <Badge size="1" variant="soft" color="gray">
                      pending
                    </Badge>
                  )}
                </Flex>
                <Button
                  size="1"
                  variant="soft"
                  color="red"
                  loading={busyId === col.userId}
                  onClick={() => void removeCollaborator(col.userId)}
                >
                  {col.status === "PENDING" ? "Cancel" : "Remove"}
                </Button>
              </Flex>
            ))
          )}
        </Flex>
      }
      footer={
        <Flex justify="end">
          <Button variant="soft" onClick={() => close(false)}>
            Done
          </Button>
        </Flex>
      }
    >
      <span style={{ display: "none" }} aria-hidden />
    </Dialog>
  );
}
