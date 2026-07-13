import { useState } from "react";
import { Dialog, Flex, Text } from "@wlcr/base-ic";
import { apiUpload } from "../lib/api";
import { FileDropzone } from "./FileDropzone";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string;
  onChanged?: () => void;
}

/** Upload artwork as the cover, with an explicit permission acknowledgement. */
export function CoverUploadDialog({
  open,
  onOpenChange,
  mediaId,
  onChanged,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      await apiUpload(`/media/${mediaId}/cover/upload`, file);
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload a cover"
      description="By uploading, you confirm you have the rights or permission to use this image as the cover."
      content={
        <Flex direction="column" gap="3">
          <FileDropzone
            accept="image/*"
            disabled={uploading}
            onFile={(f) => void upload(f)}
            label={uploading ? "Uploading…" : "Drop an image or click to browse"}
            hint="PNG, JPG, or WebP · up to 8MB"
          />
          {error && (
            <Text size="2" color="red">
              {error}
            </Text>
          )}
        </Flex>
      }
    >
      <span style={{ display: "none" }} aria-hidden />
    </Dialog>
  );
}
