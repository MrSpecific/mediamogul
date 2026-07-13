import { useState } from "react";
import { Button } from "@wlcr/base-ic";

interface Props {
  value: string;
  label?: string;
  copiedLabel?: string;
  size?: "1" | "2" | "3" | "4";
  variant?: "solid" | "soft" | "surface" | "outline" | "ghost";
}

/** Copies `value` to the clipboard, showing a transient confirmation. */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied!",
  size = "1",
  variant = "soft",
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

  return (
    <Button size={size} variant={variant} onClick={() => void copy()}>
      {copied ? copiedLabel : label}
    </Button>
  );
}
