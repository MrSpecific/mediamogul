import { Badge } from "@wlcr/base-ic";
import type { EntryStatus } from "../lib/types";

const CONFIG: Record<
  EntryStatus,
  { icon: string; label: string; color: string }
> = {
  PLANNED: { icon: "📅", label: "Planned", color: "blue" },
  IN_PROGRESS: { icon: "▶️", label: "In progress", color: "indigo" },
  ON_HOLD: { icon: "⏸️", label: "On hold", color: "amber" },
  COMPLETED: { icon: "✅", label: "Completed", color: "green" },
  ABANDONED: { icon: "🚫", label: "Abandoned", color: "red" },
};

export function StatusBadge({
  status,
  size = "1",
}: {
  status: EntryStatus;
  size?: "1" | "2" | "3";
}) {
  const c = CONFIG[status];
  return (
    <Badge color={c.color} variant="soft" size={size}>
      <span aria-hidden style={{ marginRight: 4 }}>
        {c.icon}
      </span>
      {c.label}
    </Badge>
  );
}
