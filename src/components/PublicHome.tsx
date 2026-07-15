import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Container, Flex, Heading, Text } from "@wlcr/base-ic";
import {
  BarChart3,
  Check,
  Clapperboard,
  ListChecks,
  Star,
  Tv,
  Users,
} from "lucide-react";
import { LogoMark } from "./Logo";
import {
  FEATURE_LABELS,
  FREE_HIGHLIGHTS,
  TIERS,
  formatPrice,
  type FeatureFlag,
} from "../../shared/tiers";

const FEATURES = [
  {
    icon: Clapperboard,
    title: "One catalog for everything",
    body: "Movies, TV, books, audiobooks, and magazines — tracked side by side, pulled in automatically from open sources.",
  },
  {
    icon: Star,
    title: "Rate & review",
    body: "Half-star ratings and reviews with public, unlisted, or private visibility. Build a history you actually revisit.",
  },
  {
    icon: Tv,
    title: "Episode-level TV tracking",
    body: "Import a show's full season/episode guide, tick off episodes, and watch your progress roll up automatically.",
  },
  {
    icon: ListChecks,
    title: "Lists for everything",
    body: "Curate watchlists, favorites, and themed collections — ranked or freeform, public or private.",
  },
  {
    icon: Users,
    title: "Shared & social",
    body: "Follow friends, browse public profiles, and co-build shared lists together (Standard).",
  },
  {
    icon: BarChart3,
    title: "Stats & insights",
    body: "See what you finish, your rating patterns, and yearly totals across every kind of media (Standard).",
  },
];

const FEATURE_ORDER: FeatureFlag[] = [
  "unlimitedLists",
  "sharedLists",
  "manualEntry",
  "advancedStats",
  "bulkImport",
];

/** Marketing homepage for logged-out visitors: hero, feature grid, pricing. */
export function PublicHome() {
  const navigate = useNavigate();
  const start = () => navigate("/auth/sign-up");

  return (
    <Container>
      <Flex direction="column" gap="9" className="landing">
        {/* Hero */}
        <Flex direction="column" gap="4" align="center" className="hero">
          <LogoMark size={56} />
          <Heading size="9" align="center">
            Track everything you watch, read, and listen to.
          </Heading>
          <Text size="5" color="gray" align="center" style={{ maxWidth: 620 }}>
            Movies, TV, books, and magazines — one shared catalog with your
            history, ratings, reviews, episode tracking, and lists.
          </Text>
          <Flex gap="3" wrap="wrap" justify="center">
            <Button size="4" onClick={start}>
              Get started — it's free
            </Button>
            <Button
              size="4"
              variant="soft"
              onClick={() => navigate("/auth/sign-in")}
            >
              Sign in
            </Button>
          </Flex>
        </Flex>

        {/* Feature grid */}
        <Flex direction="column" gap="4">
          <Heading size="6" align="center">
            Everything in one place
          </Heading>
          <div className="landing-grid">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title} size="3">
                <Flex direction="column" gap="2" align="start">
                  <Icon size={22} aria-hidden style={{ color: "var(--accent-9)" }} />
                  <Heading size="4">{title}</Heading>
                  <Text color="gray">{body}</Text>
                </Flex>
              </Card>
            ))}
          </div>
        </Flex>

        {/* Pricing */}
        <Flex direction="column" gap="4" align="center">
          <Heading size="6" align="center">
            Simple pricing
          </Heading>
          <Text color="gray" align="center" style={{ maxWidth: 560 }}>
            Start free forever. Upgrade any time to unlock unlimited & shared
            lists, manual entry, and power-user tools — and help keep the
            project alive.
          </Text>
          <div className="pricing-grid">
            {Object.values(TIERS).map((tier) => (
              <Card key={tier.id} size="4" className="pricing-card">
                <Flex direction="column" gap="3">
                  <Flex justify="between" align="center" gap="2">
                    <Heading size="5">{tier.name}</Heading>
                    {tier.id === "STANDARD" && (
                      <Badge color="amber">Most features</Badge>
                    )}
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
                      : FEATURE_ORDER.filter((f) => tier.features[f]).map(
                          (f) => FEATURE_LABELS[f],
                        )
                    ).map((label) => (
                      <Flex key={label} gap="2" align="center">
                        <Check size={16} aria-hidden style={{ color: "var(--green-9)" }} />
                        <Text size="2">{label}</Text>
                      </Flex>
                    ))}
                  </Flex>
                  <Button
                    size="3"
                    variant={tier.id === "STANDARD" ? "solid" : "soft"}
                    color={tier.id === "STANDARD" ? "amber" : "gray"}
                    onClick={start}
                  >
                    {tier.id === "STANDARD" ? "Get Standard" : "Start free"}
                  </Button>
                </Flex>
              </Card>
            ))}
          </div>
        </Flex>
      </Flex>
    </Container>
  );
}
