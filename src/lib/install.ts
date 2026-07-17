import { useEffect, useState } from "react";

/** The non-standard event Chromium fires when the app is installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export interface InstallState {
  /** A real (Chromium) install prompt is available to fire. */
  canPrompt: boolean;
  /** iOS Safari — no programmatic prompt, so guide to Add to Home Screen. */
  isIos: boolean;
  /** Already installed / running as a standalone app. */
  installed: boolean;
  /** Fire the native install prompt (Chromium); resolves after the choice. */
  promptInstall: () => Promise<void>;
}

/**
 * Shared PWA-install state. Browsers no longer auto-prompt, so the UI drives
 * installation itself: `canPrompt` gates the Chromium button, `isIos` gates the
 * Add-to-Home-Screen hint, and everything hides once `installed`.
 */
export function useInstall(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return {
    canPrompt: !!deferred,
    isIos: isIosDevice(),
    installed,
    promptInstall,
  };
}
