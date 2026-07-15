import { MEDIA_FIELDS } from "../../shared/media-fields";
import type { CreditRole, MediaType } from "./types";

/**
 * The primary byline for a media item — the headline credit (director, author,
 * creator, …) configured per type in MEDIA_FIELDS. Returns null when the type
 * has no primary credit or none is recorded.
 */
export function primaryByline(
  type: MediaType,
  credits: { role: CreditRole; name: string }[] | undefined,
): { prefix?: string; names: string[] } | null {
  const cfg = MEDIA_FIELDS[type];
  const role = cfg.primaryCredit;
  if (!role) return null;
  const names = (credits ?? [])
    .filter((x) => x.role === role)
    .map((x) => x.name);
  if (!names.length) return null;
  return { prefix: cfg.credits.find((x) => x.role === role)?.byline, names };
}
