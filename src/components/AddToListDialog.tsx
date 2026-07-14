import { useState } from "react";
import {
  Button,
  Dialog,
  Field,
  Flex,
  Input,
  Text,
  Textarea,
} from "@wlcr/base-ic";
import { Plus } from "lucide-react";
import { apiSend, ApiError } from "../lib/api";
import type { ListSummary } from "../lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string;
  lists: ListSummary[];
  onChanged?: () => void;
}

/** Modal to add the current media to one or more of the user's lists, with
 *  per-list loading and success/error feedback. Stays open for multiple adds. */
export function AddToListDialog({
  open,
  onOpenChange,
  mediaId,
  lists,
  onChanged,
}: Props) {
  const [addingId, setAddingId] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, "ok" | string>>({});
  const [note, setNote] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const add = async (listId: string) => {
    setAddingId(listId);
    try {
      await apiSend("POST", `/lists/${listId}/items`, {
        mediaItemId: mediaId,
        note: note.trim() || undefined,
      });
      setResult((s) => ({ ...s, [listId]: "ok" }));
      onChanged?.();
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "failed";
      setResult((s) => ({
        ...s,
        [listId]: code === "type_not_allowed" ? "Type not allowed" : "Failed",
      }));
    } finally {
      setAddingId(null);
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
      // onChanged refreshes the parent's lists, so the new one shows up in the
      // list above already marked as added.
      setResult((s) => ({ ...s, [list.id]: "ok" }));
      setNewTitle("");
      onChanged?.();
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
      setResult({});
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
      description="Add this to one or more of your lists."
      content={
        <Flex direction="column" gap="3">
          <Field
            label="Note"
            description="Optionally say why — shown next to it on the list."
          >
            <Textarea
              rows={2}
              placeholder="Why are you adding this?"
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
            />
          </Field>
          {lists.length === 0 && (
            <Text color="gray">
              You don't have any lists yet — create your first one below.
            </Text>
          )}
          {lists.map((l) => {
            const state = result[l.id];
            return (
              <Flex key={l.id} justify="space-between" align="center" gap="3">
                <Flex direction="column" className="shrink">
                  <Text weight="medium" truncate>
                    {l.title}
                  </Text>
                  <Text size="1" color="gray">
                    {l._count?.items ?? 0} items · {l.visibility.toLowerCase()}
                  </Text>
                </Flex>
                {state === "ok" ? (
                  <Text size="2" color="green">
                    Added ✓
                  </Text>
                ) : state ? (
                  <Flex gap="2" align="center">
                    <Text size="1" color="red">
                      {state}
                    </Text>
                    <Button
                      size="1"
                      variant="soft"
                      loading={addingId === l.id}
                      onClick={() => void add(l.id)}
                    >
                      Retry
                    </Button>
                  </Flex>
                ) : (
                  <Button
                    size="1"
                    variant="soft"
                    loading={addingId === l.id}
                    disabled={addingId !== null}
                    onClick={() => void add(l.id)}
                  >
                    Add
                  </Button>
                )}
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
                size="1"
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
