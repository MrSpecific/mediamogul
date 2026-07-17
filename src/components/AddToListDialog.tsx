import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Dialog,
  Field,
  Flex,
  Input,
  Separator,
  Text,
  Textarea,
  Heading,
} from "@wlcr/base-ic";
import { Check, Plus } from "lucide-react";
import { apiSend, ApiError } from "../lib/api";
import { useApiData } from "../lib/hooks";
import { useMyLists, revalidateMyLists } from "../lib/lists";
import { ListIcon } from "./ListIcon";
import { VISIBILITY_OPTIONS } from "@/lib/visibility";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string;
  /** Called after any add/remove so the opener can refresh its own view. */
  onChanged?: () => void;
}

/** Modal to add/remove the current media to/from the user's editable lists.
 *  Loads the lists and current membership itself, so callers just pass the
 *  media id. Shows "Remove" for lists that already contain the item, "Add"
 *  otherwise, and can create a new list on the spot. Stays open for multiple
 *  changes. */
export function AddToListDialog({
  open,
  onOpenChange,
  mediaId,
  onChanged,
}: Props) {
  // Lists come from the shared SWR cache: they paint instantly from cache when
  // the dialog opens, then refresh in the background (on open + on focus).
  const { data: mine } = useMyLists(open);
  const { data: membership, reload: reloadMembership } = useApiData<{
    lists: { id: string; title: string; visibility: string }[];
  }>(open && mediaId ? `/me/lists/containing/${mediaId}` : null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Editable lists = owned + lists you collaborate on. Saved lists aren't editable.
  const lists = mine ? [...mine.owned, ...mine.shared] : [];
  const inList = new Set((membership?.lists ?? []).map((l) => l.id));

  const afterChange = () => {
    reloadMembership();
    void revalidateMyLists();
    onChanged?.();
  };

  const add = async (listId: string) => {
    setBusyId(listId);
    setErrors((s) => ({ ...s, [listId]: "" }));
    try {
      await apiSend("POST", `/lists/${listId}/items`, {
        mediaItemId: mediaId,
        note: note.trim() || undefined,
      });
      afterChange();
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "failed";
      setErrors((s) => ({
        ...s,
        [listId]: code === "type_not_allowed" ? "Type not allowed" : "Failed",
      }));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (listId: string) => {
    setBusyId(listId);
    setErrors((s) => ({ ...s, [listId]: "" }));
    try {
      await apiSend("DELETE", `/lists/${listId}/items/by-media/${mediaId}`);
      afterChange();
    } catch {
      setErrors((s) => ({ ...s, [listId]: "Failed" }));
    } finally {
      setBusyId(null);
    }
  };

  // Create a brand-new list and drop the current media straight into it.
  const createAndAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const list = await apiSend<{ id: string }>("POST", "/lists", { title });
      await apiSend("POST", `/lists/${list.id}/items`, {
        mediaItemId: mediaId,
        note: note.trim() || undefined,
      });
      setNewTitle("");
      afterChange();
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "failed";
      setCreateErr(
        code === "upgrade_required"
          ? "You've reached your list limit — upgrade to create more."
          : "Couldn't create the list.",
      );
    } finally {
      setCreating(false);
    }
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setErrors({});
      setNote("");
      setNewTitle("");
      setCreateErr(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Add to a list"
      // description="Add or remove this from your lists."
      content={
        <Flex direction="column" gap="3">
          <Field label="Note">
            <Textarea
              rows={2}
              placeholder="Optionally, why are you adding this?"
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
            />
          </Field>

          <Separator />

          <Heading as="h3" size="1" color="gray">
            Your lists
          </Heading>

          {!mine && <Text color="gray">Loading your lists…</Text>}
          {mine && lists.length === 0 && (
            <Text color="gray">
              You don't have any lists yet — create your first one below.
            </Text>
          )}

          {lists.map((l) => {
            const isMember = inList.has(l.id);
            const err = errors[l.id];
            return (
              <Flex key={l.id} justify="space-between" align="center" gap="1">
                <Flex direction="column" className="shrink" gap="0">
                  <Link
                    to={`/lists/${l.id}`}
                    className="media-card-link"
                    onClick={() => close(false)}
                  >
                    <Flex gap="1" align="center" className="shrink">
                      <ListIcon handle={l.icon} size={14} />
                      <Text weight="medium" color="yellow" truncate>
                        {l.title}
                      </Text>
                    </Flex>
                  </Link>
                  <Text size="1" color="gray">
                    {l._count?.items ?? 0} items ·{" "}
                    {VISIBILITY_OPTIONS.find((o) => o.value === l.visibility)
                      ?.label ?? l.visibility.toLowerCase()}
                  </Text>
                </Flex>
                <Flex gap="2" align="center">
                  {err && (
                    <Text size="1" color="red">
                      {err}
                    </Text>
                  )}
                  {isMember ? (
                    <Button
                      size="1"
                      variant="soft"
                      color="red"
                      loading={busyId === l.id}
                      disabled={busyId !== null}
                      onClick={() => void remove(l.id)}
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      size="2"
                      variant="soft"
                      loading={busyId === l.id}
                      disabled={busyId !== null}
                      onClick={() => void add(l.id)}
                    >
                      {err ? "Retry" : "Add"}
                    </Button>
                  )}
                  {isMember && !err && (
                    <Check
                      size={16}
                      aria-hidden
                      style={{ color: "var(--green-9)" }}
                    />
                  )}
                </Flex>
              </Flex>
            );
          })}

          <Flex
            as="form"
            direction="column"
            gap="1"
            onSubmit={(e) => {
              e.preventDefault();
              void createAndAdd();
            }}
            style={{
              borderTop: "1px solid var(--gray-a4, rgba(128,128,128,0.2))",
              paddingTop: "12px",
            }}
          >
            <Text size="1" color="gray">
              Or create a new list
            </Text>
            <Flex gap="2" align="center">
              <Input
                wrapperClassName="grow"
                placeholder="New list name…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.currentTarget.value)}
              />
              <Button
                type="submit"
                size="2"
                loading={creating}
                disabled={!newTitle.trim()}
              >
                <Plus size={14} aria-hidden /> Create &amp; add
              </Button>
            </Flex>
            {createErr && (
              <Text size="1" color="red">
                {createErr}
              </Text>
            )}
          </Flex>
        </Flex>
      }
      footer={
        <Flex justify="flex-end">
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
