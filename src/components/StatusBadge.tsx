import { Badge } from "@wlcr/base-ic";
import { STATUS_ICONS } from "../lib/icons";
import type { EntryStatus } from "../lib/types";

const CONFIG: Record<EntryStatus, { label: string; color: string }> = {
  PLANNED: { label: "Planned", color: "blue" },
  IN_PROGRESS: { label: "In progress", color: "indigo" },
  ON_HOLD: { label: "On hold", color: "amber" },
  COMPLETED: { label: "Completed", color: "green" },
  ABANDONED: { label: "Abandoned", color: "red" },
};

const ICON_SIZE: Record<"1" | "2" | "3", number> = { 1: 12, 2: 14, 3: 16 };

export function StatusBadge({
  status,
  size = "1",
}: {
  status: EntryStatus;
  size?: "1" | "2" | "3";
}) {
  const c = CONFIG[status];
  const Icon = STATUS_ICONS[status];
  return (
    <Badge color={c.color} variant="soft" size={size}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon size={ICON_SIZE[size]} aria-hidden />
        {c.label}
      </span>
    </Badge>
  );
}
