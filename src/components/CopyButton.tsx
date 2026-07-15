import { useState, type ReactNode } from "react";
import { Button, type Color } from "@wlcr/base-ic";
import { Check } from "lucide-react";

interface Props {
  value: string;
  label?: string;
  copiedLabel?: string;
  size?: "1" | "2" | "3" | "4";
  variant?: "solid" | "soft" | "surface" | "outline" | "ghost";
  /** Optional leading icon (shown until copied, then a check). */
  icon?: ReactNode;
  color?: Color;
}

/** Copies `value` to the clipboard, showing a transient confirmation. */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied!",
  size = "1",
  variant = "soft",
  icon,
  color,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — no-op.
    }
  };

  const iconSize = size === "1" ? 14 : 16;

  return (
    <Button
      size={size}
      variant={variant}
      color={color}
      onClick={() => void copy()}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {copied ? <Check size={iconSize} aria-hidden /> : icon}
        {copied ? copiedLabel : label}
      </span>
    </Button>
  );
}
