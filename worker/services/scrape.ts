import type {
  CreditRole,
  ExternalSource,
  MediaType,
} from "../generated/prisma/client";

export interface CandidateCredit {
  role: CreditRole;
  name: string;
  externalId?: string;
}

/**
 * A normalized, not-yet-saved catalog candidate. The lookup endpoints return
 * these so the client can preview/edit before creating a MediaItem. Type-
 * specific attributes map to first-class MediaItem columns; people map to
 * Credit rows.
 */
export interface MediaCandidate {
  type: MediaType;
  title: string;
  coverImageUrl?: string;
  shortDescription?: string;
  synopsis?: string;
  releaseDate?: string; // ISO date
  originalLanguage?: string;
  publisher?: string;
  pageCount?: number;
  runtimeMinutes?: number;
  seasons?: number;
  episodes?: number;
  genre?: string;
  genreIds?: string[];
  credits?: CandidateCredit[];
  externalIds: { source: ExternalSource; value: string; url?: string }[];
}

function addCredit(c: MediaCandidate, role: CreditRole, name: string): void {
  c.credits ??= [];
  if (!c.credits.some((x) => x.role === role && x.name === name)) {
    c.credits.push({ role, name });
  }
}

const OL = "https://openlibrary.org";
const OL_COVERS = "https://covers.openlibrary.org";

/** Open Library book lookup by ISBN (keyless). */
export async function lookupBookByIsbn(
  isbn: string,
): Promise<MediaCandidate | null> {
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  const res = await fetch(`${OL}/isbn/${clean}.json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    title?: string;
    subtitle?: string;
    number_of_pages?: number;
    publishers?: string[];
    publish_date?: string;
    languages?: { key: string }[];
    works?: { key: string }[];
    authors?: { key: string }[];
  };
  if (!data.title) return null;

  // Resolve author names (the ISBN record only holds /authors/OL… refs).
  const authors = (
    await Promise.all(
      (data.authors ?? []).slice(0, 5).map(async (a) => {
        const r = await fetch(`${OL}${a.key}.json`, {
          headers: { Accept: "application/json" },
        }).catch(() => null);
        if (!r || !r.ok) return undefined;
        const author = (await r.json()) as { name?: string };
        return author.name;
      }),
    )
  ).filter((n): n is string => Boolean(n));

  // Works hold the description/synopsis in Open Library's model.
  let synopsis: string | undefined;
  const workKey = data.works?.[0]?.key;
  if (workKey) {
    const workRes = await fetch(`${OL}${workKey}.json`, {
      headers: { Accept: "application/json" },
    });
    if (workRes.ok) {
      const work = (await workRes.json()) as {
        description?: string | { value: string };
      };
      synopsis =
        typeof work.description === "string"
          ? work.description
          : work.description?.value;
    }
  }

  return {
    type: "BOOK",
    title: data.subtitle ? `${data.title}: ${data.subtitle}` : data.title,
    coverImageUrl: `${OL_COVERS}/b/isbn/${clean}-L.jpg`,
    shortDescription: synopsis?.split("\n")[0]?.slice(0, 280),
    synopsis,
    releaseDate: normalizeDate(data.publish_date),
    originalLanguage: data.languages?.[0]?.key?.split("/").pop(),
    pageCount: data.number_of_pages,
    publisher: data.publishers?.[0],
    credits: authors.map((name): CandidateCredit => ({ role: "AUTHOR", name })),
    externalIds: [
      { source: "ISBN", value: clean },
      { source: "OPEN_LIBRARY", value: clean, url: `${OL}/isbn/${clean}` },
    ],
  };
}

/** Open Library free-text search → up to `limit` book candidates. */
export async function searchBooks(
  query: string,
  limit = 10,
): Promise<MediaCandidate[]> {
  const url = new URL(`${OL}/search.json`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set(
    "fields",
    "key,title,subtitle,first_publish_year,cover_i,isbn,language,author_name,number_of_pages_median,publisher",
  );
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    docs?: {
      key: string;
      title?: string;
      subtitle?: string;
      first_publish_year?: number;
      cover_i?: number;
      isbn?: string[];
      language?: string[];
      author_name?: string[];
      number_of_pages_median?: number;
      publisher?: string[];
    }[];
  };

  return (data.docs ?? [])
    .filter((d) => d.title)
    .map((d) => {
      const isbn = d.isbn?.[0];
      const externalIds: MediaCandidate["externalIds"] = [
        { source: "OPEN_LIBRARY", value: d.key, url: `${OL}${d.key}` },
      ];
      if (isbn) externalIds.push({ source: "ISBN", value: isbn });
      return {
        type: "BOOK" as const,
        title: d.subtitle ? `${d.title}: ${d.subtitle}` : d.title!,
        coverImageUrl: d.cover_i
          ? `${OL_COVERS}/b/id/${d.cover_i}-L.jpg`
          : isbn
            ? `${OL_COVERS}/b/isbn/${isbn}-L.jpg`
            : undefined,
        releaseDate: d.first_publish_year
          ? `${d.first_publish_year}-01-01`
          : undefined,
        originalLanguage: d.language?.[0],
        pageCount: d.number_of_pages_median,
        publisher: d.publisher?.[0],
        credits: (d.author_name ?? [])
          .slice(0, 5)
          .map((name): CandidateCredit => ({ role: "AUTHOR", name })),
        externalIds,
      };
    });
}

// ---------------------------------------------------------------------------
// Movies / TV — TMDB (opt-in, commercial license required)
// ---------------------------------------------------------------------------

const TMDB = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

interface TmdbResult {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
}

interface TmdbDetail {
  credits: CandidateCredit[];
  runtimeMinutes?: number;
  seasons?: number;
  episodes?: number;
  genre?: string;
}

/** One detail call per title → director(s)/creator(s) + runtime/genre/seasons. */
async function tmdbDetail(
  kind: "movie" | "tv",
  id: number,
  apiKey: string,
): Promise<TmdbDetail> {
  try {
    const r = await fetch(
      `${TMDB}/${kind}/${id}?api_key=${apiKey}&append_to_response=credits`,
      { headers: { Accept: "application/json" } },
    );
    if (!r.ok) return { credits: [] };
    const d = (await r.json()) as {
      runtime?: number;
      number_of_seasons?: number;
      number_of_episodes?: number;
      episode_run_time?: number[];
      created_by?: { name: string }[];
      genres?: { name: string }[];
      credits?: { crew?: { job: string; name: string }[] };
    };
    const genre = d.genres?.[0]?.name;
    if (kind === "movie") {
      const directors = (d.credits?.crew ?? [])
        .filter((x) => x.job === "Director")
        .map((x): CandidateCredit => ({ role: "DIRECTOR", name: x.name }));
      return { credits: directors, runtimeMinutes: d.runtime || undefined, genre };
    }
    const creators = (d.created_by ?? [])
      .filter((x) => x.name)
      .map((x): CandidateCredit => ({ role: "CREATOR", name: x.name }));
    return {
      credits: creators,
      seasons: d.number_of_seasons || undefined,
      episodes: d.number_of_episodes || undefined,
      runtimeMinutes: d.episode_run_time?.[0] || undefined,
      genre,
    };
  } catch {
    return { credits: [] };
  }
}

/**
 * Movie/TV lookup via TMDB `/search/multi`, enriched with credits + details.
 * Requires a TMDB_API_KEY (v3). Note: TMDB's free tier is non-commercial.
 */
export async function searchScreen(
  query: string,
  apiKey?: string,
): Promise<MediaCandidate[]> {
  if (!apiKey) {
    throw new Error(
      "TMDB lookup is not configured. Set TMDB_API_KEY (wrangler secret put TMDB_API_KEY).",
    );
  }
  const url = new URL(`${TMDB}/search/multi`);
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: TmdbResult[] };

  const items = (data.results ?? []).filter(
    (r) => r.media_type === "movie" || r.media_type === "tv",
  );
  const details = await Promise.all(
    items.map((r) => tmdbDetail(r.media_type as "movie" | "tv", r.id, apiKey)),
  );

  return items.map((r, i) => {
    const isTv = r.media_type === "tv";
    const kind = isTv ? "tv" : "movie";
    const date = isTv ? r.first_air_date : r.release_date;
    const d = details[i];
    return {
      type: isTv ? ("TV_SHOW" as const) : ("MOVIE" as const),
      title: (isTv ? r.name : r.title) ?? "Untitled",
      coverImageUrl: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : undefined,
      shortDescription: r.overview?.slice(0, 280) || undefined,
      synopsis: r.overview || undefined,
      releaseDate: normalizeDate(date),
      originalLanguage: r.original_language,
      genre: d.genre,
      runtimeMinutes: d.runtimeMinutes,
      seasons: isTv ? d.seasons : undefined,
      episodes: isTv ? d.episodes : undefined,
      credits: d.credits,
      externalIds: [
        {
          source: "TMDB" as const,
          value: String(r.id),
          url: `https://www.themoviedb.org/${kind}/${r.id}`,
        },
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// Movies / TV — Wikidata (CC0, commercial-safe, keyless)
// ---------------------------------------------------------------------------

const WD_SPARQL = "https://query.wikidata.org/sparql";
const WD_MOVIE = new Set(["Q11424", "Q506240", "Q24856"]); // film, TV film, film series
const WD_TV = new Set(["Q5398426", "Q1259759"]); // TV series, miniseries

/**
 * Movie/TV lookup via Wikidata — CC0, safe for commercial use. Returns
 * metadata; poster images come from Wikimedia Commons (P18) only when a
 * freely-licensed file exists, so many titles have no cover.
 */
export async function searchScreenWikidata(
  query: string,
): Promise<MediaCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  const sparql = `SELECT ?item ?itemLabel ?itemDescription ?type ?date ?image ?imdb ?directorLabel ?runtime ?seasons ?episodes ?genreLabel WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:api "EntitySearch" .
    bd:serviceParam wikibase:endpoint "www.wikidata.org" .
    bd:serviceParam mwapi:search ${JSON.stringify(q)} .
    bd:serviceParam mwapi:language "en" .
    ?item wikibase:apiOutputItem mwapi:item .
  }
  ?item wdt:P31 ?type .
  VALUES ?type { wd:Q11424 wd:Q506240 wd:Q24856 wd:Q5398426 wd:Q1259759 }
  OPTIONAL { ?item wdt:P577 ?date . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wdt:P345 ?imdb . }
  OPTIONAL { ?item wdt:P57 ?director . }
  OPTIONAL { ?item wdt:P2047 ?runtime . }
  OPTIONAL { ?item wdt:P2437 ?seasons . }
  OPTIONAL { ?item wdt:P1113 ?episodes . }
  OPTIONAL { ?item wdt:P136 ?genre . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
} LIMIT 40`;

  const url = `${WD_SPARQL}?format=json&query=${encodeURIComponent(sparql)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "mediamogul/1.0 (media consumption tracker)",
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { bindings?: Record<string, { value: string } | undefined>[] };
  };

  // One item yields several rows (multiple directors/genres) — dedupe by QID
  // and accumulate credits.
  const byId = new Map<string, MediaCandidate>();
  for (const b of data.results?.bindings ?? []) {
    const itemUri = b.item?.value;
    if (!itemUri) continue;
    const qid = itemUri.split("/").pop() as string;
    const typeQid = b.type?.value?.split("/").pop() ?? "";
    const type = WD_TV.has(typeQid)
      ? ("TV_SHOW" as const)
      : WD_MOVIE.has(typeQid)
        ? ("MOVIE" as const)
        : null;
    if (!type) continue;

    const director = b.directorLabel?.value;
    const genre = b.genreLabel?.value;

    const existing = byId.get(qid);
    if (existing) {
      if (director && type === "MOVIE") addCredit(existing, "DIRECTOR", director);
      if (genre && !existing.genre) existing.genre = genre;
      continue;
    }

    const image = b.image?.value;
    const externalIds: MediaCandidate["externalIds"] = [
      {
        source: "WIKIDATA",
        value: qid,
        url: `https://www.wikidata.org/entity/${qid}`,
      },
    ];
    if (b.imdb?.value) {
      externalIds.push({
        source: "IMDB",
        value: b.imdb.value,
        url: `https://www.imdb.com/title/${b.imdb.value}/`,
      });
    }

    const candidate: MediaCandidate = {
      type,
      title: b.itemLabel?.value ?? qid,
      coverImageUrl: image
        ? `${image.replace(/^http:/, "https:")}?width=500`
        : undefined,
      shortDescription: b.itemDescription?.value,
      releaseDate: normalizeDate(b.date?.value),
      genre: genre || undefined,
      credits: [],
      externalIds,
    };
    const runtime = b.runtime?.value ? Math.round(Number(b.runtime.value)) : 0;
    if (runtime) candidate.runtimeMinutes = runtime;
    if (type === "TV_SHOW") {
      const seasons = Number(b.seasons?.value);
      const episodes = Number(b.episodes?.value);
      if (seasons) candidate.seasons = seasons;
      if (episodes) candidate.episodes = episodes;
    }
    if (director && type === "MOVIE") addCredit(candidate, "DIRECTOR", director);

    byId.set(qid, candidate);
  }
  return [...byId.values()];
}

function normalizeDate(input?: string): string | undefined {
  if (!input) return undefined;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().slice(0, 10);
}
