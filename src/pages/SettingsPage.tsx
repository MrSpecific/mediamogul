import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, Card, Flex, Heading, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { ProfileSettings } from "../components/ProfileSettings";

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
  const [error, setError] = useState<string | null>(null);

  // The upgrade lands via an async Stripe webhook — poll until the tier flips.
  const pending = justUpgraded && data != null && data.currentTier !== "STANDARD";
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => reload(), 2500);
    return () => clearTimeout(t);
  }, [pending, reload]);

  const go = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await apiSend<{ url: string | null }>("POST", path);
      if (url) window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex direction="column" gap="5">
      <Heading size="7">Settings</Heading>

      <ProfileSettings />

      <Flex direction="column" gap="3">
        <Heading size="4">Subscription</Heading>
        <Text color="gray">
          Current plan: <Badge>{data?.currentTier ?? "…"}</Badge>
        </Text>
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
                    <Button onClick={() => void go("/billing/checkout")} loading={busy}>
                      Upgrade
                    </Button>
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
