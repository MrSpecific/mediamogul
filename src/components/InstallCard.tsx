import { useState } from "react";
import { Button, Card, Flex, Text } from "@wlcr/base-ic";
import { Download, X } from "lucide-react";
import { useInstall } from "../lib/install";
import { IosInstallDialog } from "./IosInstallDialog";

const DISMISS_KEY = "mm:install-card-dismissed";

/**
 * Prominent, dismissible install prompt for the homepage. Shows only when the
 * app is installable and hasn't been installed or dismissed. The header's
 * InstallButton remains available even after this is dismissed.
 */
export function InstallCard() {
  const { canPrompt, isIos, installed, promptInstall } = useInstall();
  const [iosOpen, setIosOpen] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (installed || dismissed || (!canPrompt && !isIos)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // best-effort — a non-persistable environment just shows it again
    }
  };

  return (
    <Card size="2">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Flex direction="column" gap="1" className="shrink">
          <Text weight="medium">Install MediaMogul</Text>
          <Text size="2" color="gray">
            Add it to your {isIos ? "home screen" : "device"} for a faster,
            full-screen app that launches like any other.
          </Text>
        </Flex>
        <Flex gap="2" align="center">
          <Button
            onClick={() => (canPrompt ? void promptInstall() : setIosOpen(true))}
          >
            <Download size={16} aria-hidden /> Install
          </Button>
          <Button
            variant="ghost"
            color="gray"
            aria-label="Dismiss"
            onClick={dismiss}
          >
            <X size={16} aria-hidden />
          </Button>
        </Flex>
      </Flex>
      {isIos && <IosInstallDialog open={iosOpen} onOpenChange={setIosOpen} />}
    </Card>
  );
}
