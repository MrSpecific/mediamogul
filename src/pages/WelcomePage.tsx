import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Flex, Heading, Text } from "@wlcr/base-ic";
import { Check } from "lucide-react";
import { apiSend, ApiError } from "../lib/api";
import {
  FEATURE_LABELS,
  FREE_HIGHLIGHTS,
  TIERS,
  formatPrice,
  type FeatureFlag,
} from "../../shared/tiers";

const FEATURE_ORDER: FeatureFlag[] = [
  "unlimitedLists",
  "sharedLists",
  "manualEntry",
  "advancedStats",
  "bulkImport",
];

/** Post-signup plan picker. Free continues into the app; Standard starts Stripe
 *  checkout. Marks onboarding seen so it isn't shown again. */
export function WelcomePage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("mediamogul:onboarded", "true");
    } catch {
      /* storage blocked — fine */
    }
  }, []);

  const chooseStandard = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await apiSend<{ url: string | null }>(
        "POST",
        "/billing/checkout",
      );
      if (url) window.location.assign(url);
      else navigate("/");
    } catch (e) {
      setError(
        e instanceof ApiError && e.message === "billing_not_configured"
          ? "Billing isn't set up on this environment yet — continuing on Free."
          : "Couldn't start checkout. You can upgrade later from Settings.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex direction="column" gap="5" align="center" className="welcome">
      <Flex direction="column" gap="1" align="center">
        <Heading size="8" align="center">
          Welcome — pick a plan
        </Heading>
        <Text size="4" color="gray" align="center">
          Start free forever, or unlock everything with Standard. You can change
          any time.
        </Text>
      </Flex>

      <div className="pricing-grid">
        {Object.values(TIERS).map((tier) => (
          <Card key={tier.id} size="4" className="pricing-card">
            <Flex direction="column" gap="3">
              <Flex justify="between" align="center" gap="2">
                <Heading size="5">{tier.name}</Heading>
                {tier.id === "STANDARD" && <Badge color="amber">Recommended</Badge>}
              </Flex>
              <Text size="7" weight="bold">
                {formatPrice(tier.priceCents)}
              </Text>
              <Text color="gray">{tier.description}</Text>
              <Flex direction="column" gap="2">
                {tier.id === "STANDARD" && (
                  <Text size="2" weight="medium">
                    Everything in Free, plus:
                  </Text>
                )}
                {(tier.id === "FREE"
                  ? FREE_HIGHLIGHTS
                  : FEATURE_ORDER.filter((flag) => tier.features[flag]).map(
                      (flag) => FEATURE_LABELS[flag],
                    )
                ).map((label) => (
                  <Flex key={label} gap="2" align="center">
                    <Check size={16} aria-hidden style={{ color: "var(--green-9)" }} />
                    <Text size="2">{label}</Text>
                  </Flex>
                ))}
              </Flex>
              {tier.id === "STANDARD" ? (
                <Button
                  size="3"
                  color="amber"
                  loading={busy}
                  onClick={() => void chooseStandard()}
                >
                  Get Standard
                </Button>
              ) : (
                <Button
                  size="3"
                  variant="soft"
                  color="gray"
                  onClick={() => navigate("/")}
                >
                  Continue with Free
                </Button>
              )}
            </Flex>
          </Card>
        ))}
      </div>

      {error && (
        <Text color="red" size="2" align="center">
          {error}
        </Text>
      )}
      <Button variant="ghost" onClick={() => navigate("/")}>
        Skip for now
      </Button>
    </Flex>
  );
}
