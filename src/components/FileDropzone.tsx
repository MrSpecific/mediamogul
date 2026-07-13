import { useRef, useState } from "react";
import { Flex, Text } from "@wlcr/base-ic";

interface Props {
  onFile: (file: File) => void;
  /** `accept` attribute for the file input (e.g. "image/*"). */
  accept?: string;
  disabled?: boolean;
  /** Primary call-to-action text. */
  label?: string;
  /** Secondary hint below the label. */
  hint?: string;
}

/**
 * Reusable drag-and-drop / click-to-browse file picker. Fires `onFile` with
 * the first selected or dropped file that matches `accept`.
 */
export function FileDropzone({
  onFile,
  accept,
  disabled = false,
  label = "Drop a file here or click to browse",
  hint,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accepts = (file: File): boolean => {
    if (!accept) return true;
    // Support "image/*" style wildcards and explicit types/extensions.
    return accept.split(",").some((rule) => {
      const r = rule.trim();
      if (r.endsWith("/*")) return file.type.startsWith(r.slice(0, -1));
      if (r.startsWith(".")) return file.name.toLowerCase().endsWith(r);
      return file.type === r;
    });
  };

  const take = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (file && accepts(file)) onFile(file);
  };

  return (
    <div
      className={`dropzone${dragging ? " dropzone-active" : ""}${
        disabled ? " dropzone-disabled" : ""
      }`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        style={{ display: "none" }}
        onChange={(e) => {
          take(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <Flex direction="column" gap="1" align="center">
        <Text size="2" weight="medium">
          {label}
        </Text>
        {hint && (
          <Text size="1" color="gray" align="center">
            {hint}
          </Text>
        )}
      </Flex>
    </div>
  );
}
