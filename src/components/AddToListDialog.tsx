import { useState } from "react";
import { Button, Dialog, Flex, Text } from "@wlcr/base-ic";
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

  const add = async (listId: string) => {
    setAddingId(listId);
    try {
      await apiSend("POST", `/lists/${listId}/items`, { mediaItemId: mediaId });
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

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setResult({});
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Add to a list"
      description="Add this to one or more of your lists."
      content={
        <Flex direction="column" gap="2">
          {lists.length === 0 && (
            <Text color="gray">
              You don't have any lists yet — create one on the Lists page.
            </Text>
          )}
          {lists.map((l) => {
            const state = result[l.id];
            return (
              <Flex key={l.id} justify="space-between" align="center" gap="3">
                <Flex direction="column">
                  <Text weight="medium">{l.title}</Text>
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
