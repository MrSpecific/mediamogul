import { Button, Flex } from "@wlcr/base-ic";
import { Ban } from "lucide-react";
import { LIST_ICONS } from "../lib/list-icons";

/** Grid of curated list icons plus a "no icon" option. Stores the handle. */
export function ListIconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (handle: string | null) => void;
}) {
  return (
    <Flex gap="1" wrap="wrap">
      <Button
        type="button"
        size="1"
        variant={value == null ? "solid" : "soft"}
        color="gray"
        aria-label="No icon"
        aria-pressed={value == null}
        onClick={() => onChange(null)}
      >
        <Ban size={16} aria-hidden />
      </Button>
      {LIST_ICONS.map(({ handle, label, Icon }) => {
        const selected = value === handle;
        return (
          <Button
            key={handle}
            type="button"
            size="1"
            variant={selected ? "solid" : "soft"}
            color={selected ? undefined : "gray"}
            aria-label={label}
            aria-pressed={selected}
            onClick={() => onChange(handle)}
          >
            <Icon size={16} aria-hidden />
          </Button>
        );
      })}
    </Flex>
  );
}
