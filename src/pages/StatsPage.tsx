import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Flex, Heading, Text } from "@wlcr/base-ic";
import { useApiData } from "../lib/hooks";
import { MediaTypeBadge } from "../components/MediaTypeBadge";
import { StarRating } from "../components/StarRating";
import { MEDIA_TYPES, type MediaType } from "../lib/types";

interface Stats {
  completions: number;
  distinctTitles: number;
  thisYear: number;
  byType: Record<string, { completions: number; titles: number }>;
  statusCounts: Record<string, number>;
  ratings: {
    count: number;
    average: number | null;
    distribution: Record<string, number>;
  };
  reviews: number;
  lists: number;
}

const STAR_STEPS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card size="2" className="stat-card">
      <Flex direction="column" gap="1">
        <Text size="7" weight="bold">
          {value}
        </Text>
        <Text size="1" color="gray">
          {label}
        </Text>
      </Flex>
    </Card>
  );
}

export function StatsPage() {
  const navigate = useNavigate();
  const { data, error, loading } = useApiData<Stats>("/me/stats");

  if (error === "upgrade_required") {
    return (
      <Flex direction="column" gap="4">
        <Heading size="7">Stats</Heading>
        <Card size="4" className="empty-state">
          <Flex direction="column" align="center" gap="3">
            <Text size="6">📊</Text>
            <Heading size="5" align="center">
              Stats are a Standard feature
            </Heading>
            <Text color="gray" align="center" style={{ maxWidth: 380 }}>
              Upgrade to see your completion counts, rating habits, and
              per-format breakdowns.
            </Text>
            <Button onClick={() => navigate("/settings")}>See plans</Button>
          </Flex>
        </Card>
      </Flex>
    );
  }

  if (loading || !data) return <Text color="gray">Loading…</Text>;

  const maxDist = Math.max(
    1,
    ...STAR_STEPS.map((s) => data.ratings.distribution[String(s)] ?? 0),
  );

  return (
    <Flex direction="column" gap="5">
      <Heading size="7">Your stats</Heading>

      <div className="stat-grid">
        <Stat label="Titles completed" value={data.distinctTitles} />
        <Stat label="Total completions" value={data.completions} />
        <Stat label="Completed this year" value={data.thisYear} />
        <Stat label="Reviews written" value={data.reviews} />
        <Stat label="Lists" value={data.lists} />
        <Stat label="Ratings given" value={data.ratings.count} />
      </div>

      <Flex direction="column" gap="3">
        <Heading size="5">By format</Heading>
        <Flex direction="column" gap="2">
          {MEDIA_TYPES.filter((t) => data.byType[t.value]).length === 0 && (
            <Text color="gray">Nothing completed yet.</Text>
          )}
          {MEDIA_TYPES.map((t) => {
            const row = data.byType[t.value];
            if (!row) return null;
            return (
              <Flex key={t.value} align="center" gap="3">
                <div style={{ width: 96 }}>
                  <MediaTypeBadge type={t.value as MediaType} />
                </div>
                <Text weight="medium">{row.titles}</Text>
                <Text size="1" color="gray">
                  {row.completions !== row.titles
                    ? `${row.completions} completions`
                    : "titles"}
                </Text>
              </Flex>
            );
          })}
        </Flex>
      </Flex>

      <Flex direction="column" gap="3">
        <Heading size="5">Ratings</Heading>
        {data.ratings.count === 0 ? (
          <Text color="gray">No ratings yet.</Text>
        ) : (
          <>
            <Flex align="center" gap="3">
              <StarRating value={data.ratings.average} />
              <Text color="gray" size="2">
                {data.ratings.average?.toFixed(2)} average over{" "}
                {data.ratings.count}
              </Text>
            </Flex>
            <Flex direction="column" gap="1">
              {STAR_STEPS.map((s) => {
                const n = data.ratings.distribution[String(s)] ?? 0;
                return (
                  <Flex key={s} align="center" gap="2">
                    <Text
                      size="1"
                      color="gray"
                      style={{ width: 28, textAlign: "right" }}
                    >
                      {s}★
                    </Text>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${(n / maxDist) * 100}%` }}
                      />
                    </div>
                    <Text size="1" color="gray" style={{ width: 24 }}>
                      {n}
                    </Text>
                  </Flex>
                );
              })}
            </Flex>
          </>
        )}
      </Flex>

      {(data.statusCounts.IN_PROGRESS || data.statusCounts.PLANNED) && (
        <Flex gap="2" wrap="wrap">
          {data.statusCounts.IN_PROGRESS > 0 && (
            <Badge variant="soft" color="indigo">
              {data.statusCounts.IN_PROGRESS} in progress
            </Badge>
          )}
          {data.statusCounts.PLANNED > 0 && (
            <Badge variant="soft" color="blue">
              {data.statusCounts.PLANNED} planned
            </Badge>
          )}
        </Flex>
      )}
    </Flex>
  );
}
