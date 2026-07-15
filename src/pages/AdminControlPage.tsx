import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Flex,
  Heading,
  Input,
  Switch,
  Text,
} from "@wlcr/base-ic";
import { Play } from "lucide-react";
import { useApiData } from "../lib/hooks";
import { apiSend, ApiError } from "../lib/api";

interface CronConfig {
  seasonRefreshEnabled: boolean;
  newReleaseDiscovery: boolean;
  useTvmaze: boolean;
  useWikidata: boolean;
  useOpenLibrary: boolean;
  useTmdb: boolean;
  refreshBatchSize: number;
  minRefreshHours: number;
  lastRunAt: string | null;
  updatedAt: string;
}
interface ControlData {
  config: CronConfig;
  stats: { tvShows: number; refreshableShows: number };
}

export function AdminControlPage() {
  const { data, reload } = useApiData<ControlData>("/admin/cron-config");
  if (!data) return <Text color="gray">Loading…</Text>;
  return (
    <ControlView
      key={data.config.updatedAt}
      data={data}
      onSaved={reload}
    />
  );
}

const SOURCE_TOGGLES: { key: keyof CronConfig; label: string; note?: string }[] =
  [
    { key: "useTvmaze", label: "TVmaze", note: "TV episode guides (keyless)" },
    { key: "useWikidata", label: "Wikidata", note: "Movies/TV (CC0)" },
    { key: "useOpenLibrary", label: "Open Library", note: "Books" },
    { key: "useTmdb", label: "TMDB", note: "Optional; needs API key" },
  ];

function ControlView({
  data,
  onSaved,
}: {
  data: ControlData;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CronConfig>(data.config);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const set = <K extends keyof CronConfig>(key: K, value: CronConfig[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiSend("PUT", "/admin/cron-config", {
        seasonRefreshEnabled: form.seasonRefreshEnabled,
        newReleaseDiscovery: form.newReleaseDiscovery,
        useTvmaze: form.useTvmaze,
        useWikidata: form.useWikidata,
        useOpenLibrary: form.useOpenLibrary,
        useTmdb: form.useTmdb,
        refreshBatchSize: form.refreshBatchSize,
        minRefreshHours: form.minRefreshHours,
      });
      setMsg("Saved.");
      onSaved();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setMsg(null);
    try {
      const r = await apiSend<{ seasonsRefreshed: number }>(
        "POST",
        "/admin/cron-config/run",
      );
      setMsg(`Ran now — refreshed ${r.seasonsRefreshed} show(s).`);
      onSaved();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Run failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Flex direction="column" gap="5">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <Heading size="7">Control Center</Heading>
        <Button variant="soft" loading={running} onClick={() => void runNow()}>
          <Play size={16} aria-hidden /> Run now
        </Button>
      </Flex>
      <Text color="gray">
        Configure scheduled discovery &amp; refresh. The cron <em>schedule</em>{" "}
        (currently daily) lives in <code>wrangler.jsonc</code> and changes on
        deploy; these settings control what each run does.
      </Text>

      <Flex gap="3" wrap="wrap">
        <Badge variant="soft">{data.stats.tvShows} TV shows</Badge>
        <Badge variant="soft" color="green">
          {data.stats.refreshableShows} refreshable
        </Badge>
        <Badge variant="soft" color="gray">
          Last run:{" "}
          {data.config.lastRunAt
            ? new Date(data.config.lastRunAt).toLocaleString()
            : "never"}
        </Badge>
      </Flex>

      <Card size="3">
        <Flex direction="column" gap="3">
          <Heading size="4">Tasks</Heading>
          <ToggleRow
            label="Refresh TV seasons & episodes"
            note="Re-pull episode guides for existing shows (rotates through the catalog)."
            checked={form.seasonRefreshEnabled}
            onChange={(v) => set("seasonRefreshEnabled", v)}
          />
          <ToggleRow
            label="Discover new releases"
            note="Not yet implemented — needs a trending/new-release source."
            checked={form.newReleaseDiscovery}
            onChange={(v) => set("newReleaseDiscovery", v)}
          />
        </Flex>
      </Card>

      <Card size="3">
        <Flex direction="column" gap="3">
          <Heading size="4">Sources</Heading>
          {SOURCE_TOGGLES.map((s) => (
            <ToggleRow
              key={s.key}
              label={s.label}
              note={s.note}
              checked={form[s.key] as boolean}
              onChange={(v) => set(s.key, v as never)}
            />
          ))}
        </Flex>
      </Card>

      <Card size="3">
        <Flex direction="column" gap="3">
          <Heading size="4">Throughput</Heading>
          <Flex gap="4" wrap="wrap" align="end">
            <Field
              label="Batch size per run"
              description="Max items refreshed each scheduled run."
            >
              <Input
                type="number"
                value={String(form.refreshBatchSize)}
                onChange={(e) =>
                  set("refreshBatchSize", Number(e.currentTarget.value) || 1)
                }
                style={{ width: 120 }}
              />
            </Field>
            <Field
              label="Min hours between refreshes"
              description="Skip items refreshed more recently than this."
            >
              <Input
                type="number"
                value={String(form.minRefreshHours)}
                onChange={(e) =>
                  set("minRefreshHours", Number(e.currentTarget.value) || 1)
                }
                style={{ width: 120 }}
              />
            </Field>
          </Flex>
        </Flex>
      </Card>

      <Flex gap="3" align="center">
        <Button loading={saving} onClick={() => void save()}>
          Save settings
        </Button>
        {msg && (
          <Text size="2" color="gray">
            {msg}
          </Text>
        )}
      </Flex>
    </Flex>
  );
}

function ToggleRow({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Flex justify="between" align="center" gap="3">
      <Flex direction="column" className="shrink">
        <Text weight="medium">{label}</Text>
        {note && (
          <Text size="1" color="gray">
            {note}
          </Text>
        )}
      </Flex>
      <Switch checked={checked} onCheckedChange={(v) => onChange(v)} />
    </Flex>
  );
}
