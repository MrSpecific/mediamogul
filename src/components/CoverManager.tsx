import { useState } from "react";
import { Badge, Button, Flex, Text } from "@wlcr/base-ic";
import { Search, Star, Trash2, Upload } from "lucide-react";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { CoverFinderDialog } from "./CoverFinderDialog";
import { CoverUploadDialog } from "./CoverUploadDialog";

interface CoverAsset {
  id: string;
  url: string;
  isPrimary: boolean;
  edition: string | null;
  creator: string | null;
  license: string | null;
  sourceName: string | null;
}

interface Props {
  mediaId: string;
  title: string;
  /** Bubble up so the parent can refresh the header cover. */
  onChanged?: () => void;
}

/** Admin cover controls: add (find/upload), pick primary, delete (file + row). */
export function CoverManager({ mediaId, title, onChanged }: Props) {
  const { data: covers, reload } = useApiData<CoverAsset[]>(
    `/media/${mediaId}/covers`,
  );
  const [finderOpen, setFinderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => {
    reload();
    onChanged?.();
  };

  const setPrimary = async (assetId: string) => {
    setBusy(assetId);
    try {
      await apiSend("POST", `/media/${mediaId}/covers/${assetId}/primary`);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (assetId: string) => {
    setBusy(assetId);
    try {
      await apiSend("DELETE", `/media/${mediaId}/covers/${assetId}`);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Flex direction="column" gap="2" style={{ width: "100%" }}>
      <Flex gap="2" justify="center" wrap="wrap">
        <Button size="1" variant="soft" onClick={() => setFinderOpen(true)}>
          <Search size={14} aria-hidden /> Find
        </Button>
        <Button size="1" variant="soft" onClick={() => setUploadOpen(true)}>
          <Upload size={14} aria-hidden /> Upload
        </Button>
      </Flex>

      {covers && covers.length > 0 && (
        <div className="cover-manager-grid">
          {covers.map((cv) => (
            <div
              key={cv.id}
              className={`cover-thumb${cv.isPrimary ? " is-primary" : ""}`}
            >
              <img src={cv.url} alt="" loading="lazy" />
              <div className="cover-thumb-actions">
                {!cv.isPrimary && (
                  <button
                    type="button"
                    title="Make primary"
                    disabled={busy === cv.id}
                    onClick={() => void setPrimary(cv.id)}
                  >
                    <Star size={13} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete cover"
                  disabled={busy === cv.id}
                  onClick={() => void remove(cv.id)}
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </div>
              {cv.isPrimary && (
                <Badge className="cover-thumb-badge" size="1" color="green">
                  Primary
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
      {covers && covers.length === 0 && (
        <Text size="1" color="gray" align="center">
          No cover images yet.
        </Text>
      )}

      <CoverFinderDialog
        open={finderOpen}
        onOpenChange={setFinderOpen}
        mediaId={mediaId}
        title={title}
        onChanged={refresh}
      />
      <CoverUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        mediaId={mediaId}
        onChanged={refresh}
      />
    </Flex>
  );
}
