import { Flex, Heading, Text } from "@wlcr/base-ic";
import { Play } from "lucide-react";
import { streamingColor, streamingLabel } from "../lib/streaming";
import type { StreamingAvailability } from "../lib/types";

/** "Where to watch" — streaming provider chips that link out to the title.
 *  Renders nothing when there's no availability. */
export function WhereToWatch({
  streaming,
}: {
  streaming: StreamingAvailability[] | undefined;
}) {
  if (!streaming || streaming.length === 0) return null;
  return (
    <Flex direction="column" gap="2">
      <Heading size="4">Where to watch</Heading>
      <Flex gap="2" wrap="wrap">
        {streaming.map((s) => (
          <a
            key={s.id}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="streaming-chip"
            style={{ ["--chip" as string]: streamingColor(s.provider) }}
          >
            <Play size={13} aria-hidden />
            <Text size="2" weight="medium">
              {streamingLabel(s.provider)}
            </Text>
          </a>
        ))}
      </Flex>
    </Flex>
  );
}
