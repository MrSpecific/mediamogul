/* eslint-disable @typescript-eslint/no-unused-vars */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Field,
  Flex,
  Heading,
  Input,
  Text,
} from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { apiSend, ApiError } from "../lib/api";

interface Plan {
  id: string;
  name: string;
  price: string;
  priceCents: number;
  description: string;
}
interface PlansResponse {
  currentTier: string;
  plans: Plan[];
}

export function SettingsPage() {
  const [params] = useSearchParams();
  const justUpgraded = params.get("upgraded") === "1";
  const { data, reload } = useApiData<PlansResponse>("/billing/plans");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // Reconcile the tier directly against Stripe (source of truth), then refresh
  // the displayed plan. This is the repair path for when the async webhook was
  // delayed or never delivered, so a paid user isn't stuck on Free.
  const syncNow = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      await apiSend("POST", "/billing/sync");
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [reload]);

  // Right after checkout the upgrade normally lands via the Stripe webhook; if
  // the tier hasn't flipped yet, reconcile from Stripe ourselves once.
  const pending =
    justUpgraded && data != null && data.currentTier !== "STANDARD";
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => void syncNow(), 2500);
    return () => clearTimeout(t);
  }, [pending, syncNow]);

  const go = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await apiSend<{ url: string | null }>("POST", path, body);
      if (url) window.location.assign(url);
    } catch (e) {
      if (e instanceof ApiError && e.message === "billing_not_configured") {
        setError("Billing isn't set up on this environment yet.");
      } else if (e instanceof ApiError) {
        // Prefer the server's detailed reason (e.g. the Stripe error) over the
        // generic error code.
        const detail = (e.body as { message?: string } | undefined)?.message;
        setError(detail ?? e.message);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex direction="column" gap="5">
      <Heading size="7">Plans &amp; billing</Heading>

      <Flex direction="column" gap="3">
        <Heading size="4">Subscription</Heading>
        <Flex align="center" gap="3" wrap="wrap">
          <Text color="gray">
            Current plan: <Badge>{data?.currentTier ?? "…"}</Badge>
          </Text>
          <Button
            variant="ghost"
            size="1"
            onClick={() => void syncNow()}
            loading={syncing}
          >
            Refresh billing status
          </Button>
        </Flex>
        {pending && (
          <Text color="green" size="2">
            Payment received — finalizing your upgrade…
          </Text>
        )}

        <Flex gap="3" wrap="wrap">
          {data?.plans.map((p) => {
            const isCurrent = data.currentTier === p.id;
            return (
              <Card key={p.id} size="3" style={{ flex: "1 1 240px" }}>
                <Flex direction="column" gap="2">
                  <Heading size="5">{p.name}</Heading>
                  <Text size="6" weight="bold">
                    {p.price}
                  </Text>
                  <Text color="gray">{p.description}</Text>
                  {p.id === "STANDARD" && !isCurrent && (
                    <Flex direction="column" gap="2">
                      {/* <Field label="Discount code (optional)">
                        <Input
                          value={code}
                          onChange={(e) => setCode(e.currentTarget.value)}
                          placeholder="Enter a code"
                        />
                      </Field> */}
                      <Button
                        onClick={() =>
                          void go("/billing/checkout", {
                            code: code.trim() || undefined,
                          })
                        }
                        loading={busy}
                      >
                        Upgrade
                      </Button>
                    </Flex>
                  )}
                  {p.id === "STANDARD" && isCurrent && (
                    <Button
                      variant="soft"
                      onClick={() => void go("/billing/portal")}
                      loading={busy}
                    >
                      Manage billing
                    </Button>
                  )}
                  {isCurrent && <Badge variant="soft">Current</Badge>}
                </Flex>
              </Card>
            );
          })}
        </Flex>
        {error && <Text color="red">{error}</Text>}
      </Flex>
    </Flex>
  );
}
