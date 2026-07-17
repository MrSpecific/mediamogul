import { useState } from "react";
import { Button } from "@wlcr/base-ic";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { apiSend } from "../lib/api";

interface Props {
  listId: string;
  /** Whether the viewer already follows (saved) this list. */
  following: boolean;
  onChange?: (following: boolean) => void;
  size?: "1" | "2";
}

/**
 * Follow / unfollow (save) someone else's list. Backed by the SavedList
 * endpoints (`PUT/DELETE /lists/:id/save`). Safe to drop inside a link/card —
 * it stops click propagation.
 */
export function ListFollowButton({
  listId,
  following,
  onChange,
  size = "1",
}: Props) {
  const [on, setOn] = useState(following);
  const [busy, setBusy] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !on;
    setBusy(true);
    try {
      await apiSend(next ? "PUT" : "DELETE", `/lists/${listId}/save`);
      setOn(next);
      onChange?.(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size={size}
      variant={on ? "soft" : "solid"}
      color={on ? "gray" : undefined}
      loading={busy}
      onClick={toggle}
      aria-pressed={on}
    >
      {on ? (
        <BookmarkCheck size={14} aria-hidden />
      ) : (
        <Bookmark size={14} aria-hidden />
      )}
      {on ? "Following" : "Follow"}
    </Button>
  );
}
