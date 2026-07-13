import type { ReactNode } from "react";
import { Toggle, ToggleGroup } from "@wlcr/base-ic";

interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  size?: "1" | "2" | "3" | "4";
  ariaLabel?: string;
}

/** Single-select segmented control built on base-ic's connected ToggleGroup. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "2",
  ariaLabel,
}: Props<T>) {
  return (
    <div className="segmented-scroll">
      <ToggleGroup
        connected
        size={size}
        aria-label={ariaLabel}
        value={[value]}
        onValueChange={(next: unknown[]) => {
          const picked = next[0] as T | undefined;
          if (picked) onChange(picked); // ignore deselect — keep one always active
        }}
      >
        {options.map((o) => (
          <Toggle key={o.value} value={o.value}>
            {o.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}
