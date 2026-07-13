import { useState } from "react";
import {
  Button,
  Card,
  Field,
  Flex,
  Heading,
  Input,
  Text,
} from "@wlcr/base-ic";
import { Check, Plus, Trash2 } from "lucide-react";
import { useApiData } from "../lib/hooks";
import { apiSend } from "../lib/api";
import { formatRuntime } from "../../shared/media-fields";
import type { Season, SeasonsResponse } from "../lib/types";

interface Props {
  mediaId: string;
  isAdmin: boolean;
}

/** Seasons + episodes for a TV show, with per-episode and per-season watching. */
export function TvSeasons({ mediaId, isAdmin }: Props) {
  const { data, reload } = useApiData<SeasonsResponse>(
    `/media/${mediaId}/seasons`,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [addingSeason, setAddingSeason] = useState(false);
  const [seasonNumber, setSeasonNumber] = useState("");
  const [episodeCount, setEpisodeCount] = useState("");

  if (!data) return null;

  const watched = new Set(data.watchedEpisodeIds);

  const toggleEpisode = async (episodeId: string) => {
    setBusy(episodeId);
    try {
      await apiSend("POST", `/media/${mediaId}/episodes/${episodeId}/watch`);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const seasonWatchedCount = (s: Season) =>
    s.episodes.filter((e) => watched.has(e.id)).length;

  const markSeason = async (s: Season, watch: boolean) => {
    setBusy(s.id);
    try {
      await apiSend(
        watch ? "POST" : "DELETE",
        `/media/${mediaId}/seasons/${s.id}/watch`,
      );
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const deleteSeason = async (s: Season) => {
    setBusy(s.id);
    try {
      await apiSend("DELETE", `/media/${mediaId}/seasons/${s.id}`);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const addSeason = async () => {
    const number = Number(seasonNumber);
    if (!Number.isFinite(number)) return;
    setAddingSeason(true);
    try {
      await apiSend("POST", `/media/${mediaId}/seasons`, {
        number,
        episodeCount: episodeCount ? Number(episodeCount) : undefined,
      });
      setSeasonNumber("");
      setEpisodeCount("");
      await reload();
    } finally {
      setAddingSeason(false);
    }
  };

  if (data.seasons.length === 0 && !isAdmin) return null;

  return (
    <Flex direction="column" gap="3">
      <Heading size="5">Seasons &amp; episodes</Heading>

      {data.seasons.length === 0 && (
        <Text color="gray">No seasons added yet.</Text>
      )}

      {data.seasons.map((s) => {
        const done = seasonWatchedCount(s);
        const total = s.episodes.length;
        const allWatched = total > 0 && done === total;
        return (
          <Card key={s.id} size="2">
            <Flex direction="column" gap="3">
              <Flex justify="space-between" align="center" gap="2" wrap="wrap">
                <Flex direction="column">
                  <Text weight="medium">
                    {s.title || `Season ${s.number}`}
                  </Text>
                  <Text size="1" color="gray">
                    {total > 0
                      ? `${done}/${total} watched`
                      : "No episodes yet"}
                  </Text>
                </Flex>
                <Flex gap="2" align="center">
                  {total > 0 && (
                    <Button
                      size="1"
                      variant={allWatched ? "soft" : "solid"}
                      color={allWatched ? "gray" : undefined}
                      loading={busy === s.id}
                      onClick={() => void markSeason(s, !allWatched)}
                    >
                      {allWatched ? "Unwatch season" : "Mark season watched"}
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size="1"
                      variant="ghost"
                      color="red"
                      onClick={() => void deleteSeason(s)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  )}
                </Flex>
              </Flex>

              {s.episodes.length > 0 && (
                <Flex direction="column" gap="1">
                  {s.episodes.map((e) => {
                    const isWatched = watched.has(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        className={`episode-row${isWatched ? " watched" : ""}`}
                        disabled={busy === e.id}
                        onClick={() => void toggleEpisode(e.id)}
                      >
                        <span className="episode-check" aria-hidden>
                          {isWatched && <Check size={14} />}
                        </span>
                        <Text size="2" className="episode-num">
                          {e.number}
                        </Text>
                        <Text size="2" className="episode-title">
                          {e.title || `Episode ${e.number}`}
                        </Text>
                        {e.runtimeMinutes && (
                          <Text size="1" color="gray">
                            {formatRuntime(e.runtimeMinutes)}
                          </Text>
                        )}
                      </button>
                    );
                  })}
                </Flex>
              )}
            </Flex>
          </Card>
        );
      })}

      {isAdmin && (
        <Card size="2">
          <Flex direction="column" gap="2">
            <Text size="2" weight="medium">
              Add a season
            </Text>
            <Flex gap="2" wrap="wrap" align="end">
              <Field label="Season #">
                <Input
                  type="number"
                  value={seasonNumber}
                  onChange={(e) => setSeasonNumber(e.currentTarget.value)}
                  style={{ width: 90 }}
                />
              </Field>
              <Field label="Episodes">
                <Input
                  type="number"
                  placeholder="e.g. 10"
                  value={episodeCount}
                  onChange={(e) => setEpisodeCount(e.currentTarget.value)}
                  style={{ width: 110 }}
                />
              </Field>
              <Button
                loading={addingSeason}
                disabled={!seasonNumber}
                onClick={() => void addSeason()}
              >
                <Plus size={16} aria-hidden /> Add
              </Button>
            </Flex>
          </Flex>
        </Card>
      )}
    </Flex>
  );
}
