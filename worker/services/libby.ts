// Libby / OverDrive lookup via the public "Thunder" API. Search is scoped to a
// library (any large public library's catalog works for id resolution); the
// resulting OverDrive title id is stable across libraries. Cover art is served
// from od-cdn.com and is safe to ingest.

export interface LibbyCandidate {
  id: string; // OverDrive title id (stable)
  title: string;
  subtitle?: string;
  creator?: string;
  coverUrl?: string;
  format?: string; // "ebook" | "audiobook" | "magazine" | …
  seriesName?: string;
  seriesPosition?: number;
  url: string; // public Libby share link
}

const THUNDER = "https://thunder.api.overdrive.com/v2";

/** Public, no-login Libby share page for a title id. */
export const libbyTitleUrl = (id: string): string =>
  `https://share.libbyapp.com/title/${id}`;

interface ThunderItem {
  id: string;
  title?: string;
  subtitle?: string;
  firstCreatorName?: string;
  type?: { id?: string };
  covers?: Record<string, { href?: string } | undefined>;
  series?: string;
  detailedSeries?: { seriesName?: string; readingOrder?: string };
}

/** Search a library's OverDrive catalog. Returns normalized candidates. */
export async function searchLibby(
  query: string,
  libraryKey: string,
  perPage = 12,
): Promise<LibbyCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const url = new URL(`${THUNDER}/libraries/${libraryKey}/media`);
  url.searchParams.set("query", q);
  url.searchParams.set("perPage", String(perPage));
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "mediamogul/1.0 (media consumption tracker)",
    },
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json()) as { items?: ThunderItem[] };
  return (data.items ?? [])
    .filter((it) => it.id && it.title)
    .map((it) => ({
      id: String(it.id),
      title: it.title!,
      subtitle: it.subtitle,
      creator: it.firstCreatorName,
      coverUrl:
        it.covers?.cover300Wide?.href ?? it.covers?.cover150Wide?.href,
      format: it.type?.id,
      seriesName: it.detailedSeries?.seriesName ?? it.series,
      seriesPosition: Number(it.detailedSeries?.readingOrder) || undefined,
      url: libbyTitleUrl(String(it.id)),
    }));
}
