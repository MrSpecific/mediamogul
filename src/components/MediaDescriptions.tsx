import { useState } from "react";
import { BookOpen, Info } from "lucide-react";
import { Button, Dialog, Flex, Text } from "@wlcr/base-ic";

interface Props {
  shortDescription?: string | null;
  synopsis?: string | null;
}

type DescriptionKind = "short" | "synopsis";

/**
 * Keeps potentially revealing media descriptions behind an explicit action.
 * Nothing is shown until the user chooses which kind of description to read.
 */
export function MediaDescriptions({ shortDescription, synopsis }: Props) {
  const [open, setOpen] = useState<DescriptionKind | null>(null);
  const content = open === "short" ? shortDescription : synopsis;
  const title = open === "short" ? "Short description" : "Synopsis";

  if (!shortDescription && !synopsis) return null;

  return (
    <>
      <Flex gap="2" wrap="wrap">
        {shortDescription && (
          <Button size="2" variant="soft" onClick={() => setOpen("short")}>
            <Info size={15} aria-hidden /> Short description
          </Button>
        )}
        {synopsis && (
          <Button size="2" variant="soft" onClick={() => setOpen("synopsis")}>
            <BookOpen size={15} aria-hidden /> Synopsis
          </Button>
        )}
      </Flex>

      <Dialog
        open={open !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setOpen(null);
        }}
        size="large"
        title={title}
        content={
          <Text className="media-description-content">{content}</Text>
        }
        footer={
          <Flex justify="end">
            <Button variant="soft" onClick={() => setOpen(null)}>
              Close
            </Button>
          </Flex>
        }
      >
        <span style={{ display: "none" }} aria-hidden />
      </Dialog>
    </>
  );
}
