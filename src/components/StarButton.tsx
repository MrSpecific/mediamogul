import { useState } from "react";
import { Button } from "@wlcr/base-ic";
import { Star } from "lucide-react";
import { apiSend } from "../lib/api";

interface Props {
  listId: string;
  starred: boolean;
  /** Called after a successful toggle with the new state (e.g. to reload). */
  onChange?: (starred: boolean) => void;
  size?: "1" | "2";
  /** Show a "Star"/"Starred" text label next to the icon. */
  withLabel?: boolean;
}

/** Toggles whether a list is starred (pinned prominently for the user). Safe
 *  to drop inside a link/card — it stops click propagation. */
export function StarButton({
  listId,
  starred,
  onChange,
  size = "1",
  withLabel = false,
}: Props) {
  const [on, setOn] = useState(starred);
  const [busy, setBusy] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !on;
    setBusy(true);
    try {
      await apiSend(next ? "PUT" : "DELETE", `/lists/${listId}/star`);
      setOn(next);
      onChange?.(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size={size}
      variant={on ? "solid" : "soft"}
      color={on ? "amber" : "gray"}
      loading={busy}
      onClick={toggle}
      aria-label={on ? "Unstar list" : "Star list"}
      aria-pressed={on}
    >
      <Star size={14} aria-hidden fill={on ? "currentColor" : "none"} />
      {withLabel && (on ? "Starred" : "Star")}
    </Button>
  );
}
