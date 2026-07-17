import { Button, Dialog, Flex, Text } from "@wlcr/base-ic";
import { Share } from "lucide-react";

/** Instructions for installing on iOS Safari, which has no programmatic prompt. */
export function IosInstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Install MediaMogul"
      content={
        <Text size="2">
          In Safari, tap the{" "}
          <Share size={14} aria-hidden style={{ verticalAlign: "-2px" }} /> Share
          button, then choose <b>Add to Home Screen</b>.
        </Text>
      }
      footer={
        <Flex justify="end">
          <Button variant="soft" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </Flex>
      }
    >
      <button type="button" style={{ display: "none" }} aria-hidden />
    </Dialog>
  );
}
