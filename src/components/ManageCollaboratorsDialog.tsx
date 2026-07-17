import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Dialog, Flex, Text } from "@wlcr/base-ic";
import { UserPlus } from "lucide-react";
import { apiSend, ApiError } from "../lib/api";
import { useMe, hasFeature } from "../lib/features";
import { UpgradeCTA } from "./UpgradeCTA";
import { UsernameCombobox } from "./UsernameCombobox";
import {
  COLLABORATOR_STATUS_META,
  type ListCollaborator,
} from "../lib/types";

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
  const { data: me } = useMe();
  const canShare = hasFeature(me, "sharedLists");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invite = async (name?: string) => {
    const uname = (name ?? inviteName).trim().replace(/^@/, "");
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
          {canShare ? (
            <Flex
              as="form"
              gap="2"
              align="center"
              onSubmit={(e) => {
                e.preventDefault();
                void invite();
              }}
            >
              <UsernameCombobox
                value={inviteName}
                onChange={setInviteName}
                placeholder="Invite by @username"
                onPick={(username) => void invite(username)}
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
          ) : (
            <UpgradeCTA title="Shared lists are a Standard feature">
              Upgrade to invite people to co-edit your lists.
            </UpgradeCTA>
          )}
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
                  <Link
                    to={`/u/${col.user.username}`}
                    className="byline-link"
                  >
                    <Text size="2" truncate>
                      @{col.user.username}
                    </Text>
                  </Link>
                  <Badge
                    size="1"
                    variant="soft"
                    color={COLLABORATOR_STATUS_META[col.status].color}
                  >
                    {COLLABORATOR_STATUS_META[col.status].label}
                  </Badge>
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
