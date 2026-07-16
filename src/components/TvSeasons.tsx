import { useState } from "react";
import {
  Button,
  Card,
  Field,
  Flex,
  Heading,
  Input,
  Progress,
  Text,
} from "@wlcr/base-ic";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import { useApiData } from "../lib/hooks";
import { apiSend, ApiError } from "../lib/api";
import { formatRuntime } from "../../shared/media-fields";
import type { Season, SeasonsResponse } from "../lib/types";

/** Human-readable episode air date, e.g. "Jun 2, 2002". */
function formatAirDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

interface Props {
  mediaId: string;
  isAdmin: boolean;
  /** Fired after a watch change, so the parent can refresh the show's status
   *  (which now auto-syncs with episode progress). */
  onProgressChange?: () => void;
}

/** Seasons + episodes for a TV show, with per-episode and per-season watching. */
export function TvSeasons({ mediaId, isAdmin, onProgressChange }: Props) {
  const { data, reload } = useApiData<SeasonsResponse>(
    `/media/${mediaId}/seasons`,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [addingSeason, setAddingSeason] = useState(false);
  const [seasonNumber, setSeasonNumber] = useState("");
  const [episodeCount, setEpisodeCount] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Which season accordions are open. Empty = all collapsed (the default).
  const [openSeasons, setOpenSeasons] = useState<Set<string>>(new Set());

  const toggleExpanded = (episodeId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(episodeId)) next.delete(episodeId);
      else next.add(episodeId);
      return next;
    });

  const toggleSeason = (seasonId: string) =>
    setOpenSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(seasonId)) next.delete(seasonId);
      else next.add(seasonId);
      return next;
    });

  if (!data) return null;

  const allSeasonsOpen =
    data.seasons.length > 0 && data.seasons.every((s) => openSeasons.has(s.id));
  const toggleAllSeasons = () =>
    setOpenSeasons(
      allSeasonsOpen ? new Set() : new Set(data.seasons.map((s) => s.id)),
    );

  const watched = new Set(data.watchedEpisodeIds);

  const toggleEpisode = async (episodeId: string) => {
    setBusy(episodeId);
    try {
      await apiSend("POST", `/media/${mediaId}/episodes/${episodeId}/watch`);
      await reload();
      onProgressChange?.();
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
      onProgressChange?.();
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

  const importFromTmdb = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await apiSend<{
        source: string | null;
        seasons: number;
        episodes: number;
      }>("POST", `/media/${mediaId}/seasons/import`);
      await reload();
      const via = r.source === "tvmaze" ? "TVmaze" : r.source === "tmdb" ? "TMDB" : "the episode guide";
      setImportMsg(
        `Imported ${r.seasons} season${r.seasons === 1 ? "" : "s"} and ${r.episodes} episode${r.episodes === 1 ? "" : "s"} from ${via}.`,
      );
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "failed";
      setImportMsg(
        code === "not_found_on_sources"
          ? "Couldn't find an episode guide for this show. Add an IMDB id, or add seasons manually below."
          : "Import failed. Try again or add seasons manually.",
      );
    } finally {
      setImporting(false);
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

  // Show-level progress rolled up across every season.
  const totalEpisodes = data.seasons.reduce(
    (n, s) => n + s.episodes.length,
    0,
  );
  const watchedEpisodes = data.seasons.reduce(
    (n, s) => n + s.episodes.filter((e) => watched.has(e.id)).length,
    0,
  );
  const pct =
    totalEpisodes > 0 ? Math.round((watchedEpisodes / totalEpisodes) * 100) : 0;
  const complete = totalEpisodes > 0 && watchedEpisodes === totalEpisodes;

  return (
    <Flex direction="column" gap="3">
      <Flex direction="column" gap="2">
        <Flex justify="space-between" align="center" gap="2" wrap="wrap">
          <Flex gap="1" align="center">
            <Heading size="5">Seasons &amp; episodes</Heading>
            {data.seasons.length > 0 && (
              <Button
                size="1"
                variant="ghost"
                color="gray"
                aria-label={
                  allSeasonsOpen ? "Collapse all seasons" : "Expand all seasons"
                }
                title={allSeasonsOpen ? "Collapse all" : "Expand all"}
                onClick={toggleAllSeasons}
              >
                {allSeasonsOpen ? (
                  <ChevronsDownUp size={16} aria-hidden />
                ) : (
                  <ChevronsUpDown size={16} aria-hidden />
                )}
              </Button>
            )}
          </Flex>
          {totalEpisodes > 0 && (
            <Text size="2" color={complete ? "green" : "gray"}>
              {watchedEpisodes}/{totalEpisodes} episodes watched
            </Text>
          )}
        </Flex>
        {totalEpisodes > 0 && (
          <Progress
            value={pct}
            size="1"
            color={complete ? "green" : undefined}
          />
        )}
      </Flex>

      {data.seasons.length === 0 && (
        <Flex direction="column" gap="2" align="start">
          <Text color="gray">
            No episode data has been added for this show yet.
          </Text>
          {isAdmin && (
            <Button
              variant="soft"
              loading={importing}
              onClick={() => void importFromTmdb()}
            >
              <Download size={16} aria-hidden /> Import episode guide
            </Button>
          )}
        </Flex>
      )}
      {importMsg && (
        <Text size="2" color="gray">
          {importMsg}
        </Text>
      )}

      {data.seasons.map((s) => {
        const done = seasonWatchedCount(s);
        const total = s.episodes.length;
        const allWatched = total > 0 && done === total;
        const isOpen = openSeasons.has(s.id);
        return (
          <Card key={s.id} size="2">
            <Flex direction="column" gap="3">
              <Flex justify="space-between" align="center" gap="2" wrap="wrap">
                <button
                  type="button"
                  className="season-toggle"
                  aria-expanded={isOpen}
                  onClick={() => toggleSeason(s.id)}
                >
                  {isOpen ? (
                    <ChevronDown size={16} aria-hidden />
                  ) : (
                    <ChevronRight size={16} aria-hidden />
                  )}
                  <span className="season-toggle-text">
                    <Text weight="medium">
                      {s.title || `Season ${s.number}`}
                    </Text>
                    <Text size="1" color="gray">
                      {total > 0
                        ? `${done}/${total} watched`
                        : "No episodes yet"}
                    </Text>
                  </span>
                </button>
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

              {isOpen && s.episodes.length > 0 && (
                <Flex direction="column" gap="1">
                  {s.episodes.map((e) => {
                    const isWatched = watched.has(e.id);
                    const meta = [
                      e.director ? `Dir. ${e.director}` : null,
                      e.runtimeMinutes ? formatRuntime(e.runtimeMinutes) : null,
                      e.airDate ? formatAirDate(e.airDate) : null,
                    ].filter(Boolean);
                    const canExpand = Boolean(e.synopsis);
                    const isExpanded = expanded.has(e.id);
                    return (
                      <div key={e.id} className="episode-item">
                        <div
                          className={`episode-row${isWatched ? " watched" : ""}`}
                        >
                          <Text size="2" className="episode-num">
                            {e.number}
                          </Text>
                          <button
                            type="button"
                            className="episode-title"
                            disabled={!canExpand}
                            aria-expanded={canExpand ? isExpanded : undefined}
                            onClick={() => canExpand && toggleExpanded(e.id)}
                          >
                            <Text size="2" truncate>
                              {canExpand &&
                                (isExpanded ? (
                                  <ChevronDown size={13} aria-hidden className="episode-caret" />
                                ) : (
                                  <ChevronRight size={13} aria-hidden className="episode-caret" />
                                ))}
                              {e.title || `Episode ${e.number}`}
                            </Text>
                            {meta.length > 0 && (
                              <Text size="1" color="gray">
                                {meta.join(" · ")}
                              </Text>
                            )}
                          </button>
                          <Button
                            size="1"
                            variant="soft"
                            color={isWatched ? "green" : "gray"}
                            loading={busy === e.id}
                            onClick={() => void toggleEpisode(e.id)}
                          >
                            {isWatched ? (
                              <>
                                <Check size={14} aria-hidden /> Watched
                              </>
                            ) : (
                              "Mark watched"
                            )}
                          </Button>
                        </div>
                        {isExpanded && e.synopsis && (
                          <Text size="1" color="gray" className="episode-synopsis">
                            {e.synopsis}
                          </Text>
                        )}
                      </div>
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
            <Flex justify="between" align="center" gap="2" wrap="wrap">
              <Text size="2" weight="medium">
                Add a season
              </Text>
              <Button
                size="1"
                variant="soft"
                loading={importing}
                onClick={() => void importFromTmdb()}
              >
                <Download size={14} aria-hidden /> Import episode guide
              </Button>
            </Flex>
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
