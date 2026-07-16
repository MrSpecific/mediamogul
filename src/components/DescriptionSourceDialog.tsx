import { useEffect, useState } from "react";
import { Badge, Button, Dialog, Flex, Text } from "@wlcr/base-ic";
import { apiGet, apiSend } from "../lib/api";

interface DescriptionSource {
  source: string | null;
  current: { shortDescription: string | null; synopsis: string | null };
  proposed: { shortDescription: string | null; synopsis: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string;
  onChanged?: () => void;
}

const FIELDS = [
  { key: "shortDescription", label: "Short description" },
  { key: "synopsis", label: "Synopsis" },
] as const;

const show = (v: string | null) => (v && v.trim() ? v : "—");

/** Admin: pull a better short description / synopsis from the best source for
 *  the media type, compare against what's stored, and apply the chosen fields. */
export function DescriptionSourceDialog({
  open,
  onOpenChange,
  mediaId,
  onChanged,
}: Props) {
  const [data, setData] = useState<DescriptionSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  /* Fetch-on-open: reset + load whenever the dialog opens. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setData(null);
    setError(null);
    setPicked({});
    setLoading(true);
    apiGet<DescriptionSource>(`/media/${mediaId}/description-source`)
      .then((r) => {
        setData(r);
        // Default-check fields that are currently empty but newly available.
        const next: Record<string, boolean> = {};
        if (r.proposed) {
          for (const f of FIELDS) {
            const cur = r.current[f.key];
            const prop = r.proposed[f.key];
            if ((!cur || !cur.trim()) && prop && prop.trim()) next[f.key] = true;
          }
        }
        setPicked(next);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, mediaId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Fields where the source offers something different from what's stored.
  const diffFields = FIELDS.filter((f) => {
    const prop = data?.proposed?.[f.key];
    if (!prop || !prop.trim()) return false;
    return prop.trim() !== (data?.current[f.key] ?? "").trim();
  });
  const anyPicked = Object.values(picked).some(Boolean);

  const toggle = (key: string) =>
    setPicked((p) => ({ ...p, [key]: !p[key] }));

  const apply = async () => {
    if (!data?.proposed) return;
    setApplying(true);
    setError(null);
    const patch: Record<string, string> = {};
    for (const f of diffFields) {
      if (picked[f.key]) patch[f.key] = data.proposed[f.key]!;
    }
    try {
      await apiSend("POST", `/media/${mediaId}/apply`, { patch });
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="large"
      title="Improve description"
      description="Pull a fresh description from the best source for this media type and choose what to apply."
      content={
        <Flex direction="column" gap="3">
          {loading && <Text color="gray">Searching for a better source…</Text>}
          {error && (
            <Text color="red" size="2">
              {error}
            </Text>
          )}
          {!loading && data && !data.proposed && (
            <Text color="gray">
              Couldn't find a better description from an automated source for
              this item.
            </Text>
          )}
          {!loading && data?.proposed && diffFields.length === 0 && (
            <Text color="gray">
              {data.source
                ? `${data.source} has nothing new — the stored text already matches.`
                : "Nothing new to apply."}
            </Text>
          )}

          {data?.proposed && diffFields.length > 0 && (
            <>
              {data.source && (
                <Flex gap="2" align="center">
                  <Text size="1" color="gray">
                    Source
                  </Text>
                  <Badge variant="soft" color="gray">
                    {data.source}
                  </Badge>
                </Flex>
              )}
              {diffFields.map((f) => (
                <label key={f.key} className="diff-row">
                  <input
                    type="checkbox"
                    checked={!!picked[f.key]}
                    onChange={() => toggle(f.key)}
                  />
                  <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
                    <Text size="1" color="gray">
                      {f.label}
                    </Text>
                    <Text size="2" className="diff-old">
                      {show(data.current[f.key])}
                    </Text>
                    <Text size="2" weight="medium">
                      → {show(data.proposed![f.key])}
                    </Text>
                  </Flex>
                </label>
              ))}
            </>
          )}
        </Flex>
      }
      footer={
        <Flex gap="2" justify="end">
          <Button variant="soft" color="gray" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void apply()}
            loading={applying}
            disabled={!anyPicked}
          >
            Apply selected
          </Button>
        </Flex>
      }
    >
      <span style={{ display: "none" }} aria-hidden />
    </Dialog>
  );
}
