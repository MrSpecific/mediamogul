// Wikipedia lookup via the MediaWiki API. Keyless and CC BY-SA. Used to link a
// canonical Wikipedia article to a media item and (for movies/TV, which lack a
// synopsis from Wikidata) to adopt the article intro as the synopsis.

export interface WikipediaCandidate {
  title: string;
  /** Short teaser (first paragraph of the intro), for the result list. */
  description?: string;
  /** Full plain-text intro — offered as a synopsis when linking. */
  extract?: string;
  url: string;
}

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const UA = "mediamogul/1.0 (media consumption tracker)";

/** First paragraph (or ~280 chars) of an intro extract, for previews. */
function teaser(extract: string): string {
  const firstPara = extract.split(/\n\s*\n|\n/)[0]?.trim() || extract.trim();
  return firstPara.length > 280 ? `${firstPara.slice(0, 277)}…` : firstPara;
}

/**
 * Search Wikipedia and return the top articles with their intro extract + URL,
 * in relevance order. One request via `generator=search` + `prop=extracts|info`.
 */
export async function searchWikipedia(
  query: string,
  limit = 8,
): Promise<WikipediaCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const url = new URL(WIKI_API);
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: q,
    gsrlimit: String(limit),
    gsrnamespace: "0", // articles only
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { title?: string; extract?: string; fullurl?: string; index?: number }
      >;
    };
  };
  const pages = Object.values(data.query?.pages ?? {});
  // `generator=search` preserves relevance via each page's `index`.
  pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages
    .filter((p): p is { title: string; fullurl: string; extract?: string } =>
      Boolean(p.title && p.fullurl),
    )
    .map((p) => {
      const extract = p.extract?.trim() || undefined;
      return {
        title: p.title,
        url: p.fullurl,
        extract,
        description: extract ? teaser(extract) : undefined,
      };
    });
}

/**
 * Fetch the intro extract for a specific Wikipedia article title (used to adopt
 * a synopsis for a manually-pasted URL). Returns null if unavailable.
 */
export async function fetchWikipediaExtract(
  title: string,
): Promise<string | null> {
  const t = title.trim();
  if (!t) return null;
  const url = new URL(WIKI_API);
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    origin: "*",
    titles: t,
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    redirects: "1",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { extract?: string }> };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  return page?.extract?.trim() || null;
}

/**
 * Fetch the original lead/poster image URL for a Wikipedia article title (used
 * to adopt the article's main image as a cover). Returns null if none.
 */
export async function fetchWikipediaImage(
  title: string,
): Promise<string | null> {
  const t = title.trim();
  if (!t) return null;
  const url = new URL(WIKI_API);
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    origin: "*",
    titles: t,
    prop: "pageimages",
    piprop: "original",
    redirects: "1",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { original?: { source?: string } }> };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  return page?.original?.source ?? null;
}

/** Extract the article title from a Wikipedia URL (…/wiki/Article_Title). */
export function wikipediaTitleFromUrl(url: string): string | null {
  const m = url.match(/\/wiki\/([^#?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, " ");
  } catch {
    return m[1].replace(/_/g, " ");
  }
}
