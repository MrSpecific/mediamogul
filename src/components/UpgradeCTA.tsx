import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Flex, Text } from "@wlcr/base-ic";
import { Sparkles } from "lucide-react";

interface Props {
  title: string;
  children?: ReactNode;
  /** Button label. Default: "Upgrade to Standard". */
  cta?: string;
  /** Compact inline variant (no card chrome). */
  inline?: boolean;
}

/** Upgrade prompt shown wherever a Standard-only capability is gated. Sends the
 *  user to Plans & billing to subscribe. */
export function UpgradeCTA({ title, children, cta, inline }: Props) {
  const navigate = useNavigate();
  const body = (
    <Flex direction="column" gap="2" align="start">
      <Flex gap="2" align="center">
        <Sparkles size={16} aria-hidden style={{ color: "var(--amber-9)" }} />
        <Text weight="medium">{title}</Text>
      </Flex>
      {children && (
        <Text size="2" color="gray">
          {children}
        </Text>
      )}
      <Button
        size="2"
        color="amber"
        onClick={() => navigate("/settings?upgrade=1")}
      >
        {cta ?? "Upgrade to Standard"}
      </Button>
    </Flex>
  );
  if (inline) return body;
  return (
    <Card size="2" className="upgrade-cta">
      {body}
    </Card>
  );
}
