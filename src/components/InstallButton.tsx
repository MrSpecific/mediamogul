import { useState } from "react";
import { Button } from "@wlcr/base-ic";
import { Download } from "lucide-react";
import { useInstall } from "../lib/install";
import { IosInstallDialog } from "./IosInstallDialog";

/**
 * Compact "Install" affordance for the app header. Fires the native prompt on
 * Chromium, opens the Add-to-Home-Screen hint on iOS, and renders nothing once
 * installed or in browsers without install support.
 */
export function InstallButton() {
  const { canPrompt, isIos, installed, promptInstall } = useInstall();
  const [iosOpen, setIosOpen] = useState(false);

  if (installed || (!canPrompt && !isIos)) return null;

  return (
    <>
      <Button
        variant="soft"
        size="1"
        onClick={() => (canPrompt ? void promptInstall() : setIosOpen(true))}
      >
        <Download size={16} aria-hidden /> Install
      </Button>
      {isIos && <IosInstallDialog open={iosOpen} onOpenChange={setIosOpen} />}
    </>
  );
}
