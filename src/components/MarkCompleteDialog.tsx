import { useEffect, useState } from "react";
import { Button, Dialog, Flex, Select, Text, Textarea } from "@wlcr/base-ic";
import { StarRating } from "./StarRating";
import type { Visibility } from "../lib/types";

interface ConfirmArgs {
  stars: number | null;
  reviewBody: string;
  visibility: Visibility;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verbPast: string; // "read" / "watched" / "listened"
  initialStars: number | null;
  initialReview: string;
  onConfirm: (args: ConfirmArgs) => Promise<void>;
}

/** Confirmation modal for marking media complete, with an inline rating +
 *  review to encourage capturing them at the moment of completion. */
export function MarkCompleteDialog({
  open,
  onOpenChange,
  verbPast,
  initialStars,
  initialReview,
  onConfirm,
}: Props) {
  const [stars, setStars] = useState<number | null>(initialStars);
  const [body, setBody] = useState(initialReview);
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStars(initialStars);
      setBody(initialReview);
    }
  }, [open, initialStars, initialReview]);

  const confirm = async () => {
    setSaving(true);
    try {
      await onConfirm({ stars, reviewBody: body.trim(), visibility });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Mark as ${verbPast}`}
      description="Rate it or jot a quick review while it's fresh (optional)."
      content={
        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2" color="gray">
              Your rating
            </Text>
            <StarRating value={stars} onChange={setStars} size={30} />
          </Flex>
          <Textarea
            rows={4}
            placeholder="Review (optional)…"
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
          />
          <Select
            value={visibility}
            onValueChange={(v) => setVisibility(v as Visibility)}
          >
            <Select.Item value="PUBLIC">Public</Select.Item>
            <Select.Item value="UNLISTED">Unlisted</Select.Item>
            <Select.Item value="PRIVATE">Private</Select.Item>
          </Select>
        </Flex>
      }
      footer={
        <Flex gap="2" justify="flex-end">
          <Button variant="soft" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} loading={saving}>
            Mark as {verbPast}
          </Button>
        </Flex>
      }
    >
      <span style={{ display: "none" }} aria-hidden />
    </Dialog>
  );
}
