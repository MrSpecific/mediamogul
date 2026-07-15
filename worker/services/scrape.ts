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
  subtitle?: string;
  coverImageUrl?: string;
  shortDescription?: string;
  synopsis?: string;
  wikipediaUrl?: string;
  releaseDate?: string; // ISO date
  originalLanguage?: string;
  publisher?: string;
  pageCount?: number;
  runtimeMinutes?: number;
  seasons?: number;
  episodes?: number;
  genre?: string;
  genreIds?: string[];
  /** Series membership (e.g. "Harry Potter", position 2), when known. */
  seriesName?: string;
  seriesPosition?: number;
  /** Source-specific series id, for fetching all members (e.g. Wikidata QID). */
  seriesId?: string;
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

function descriptionText(
  value?: string | { value?: string } | null,
): string | undefined {
  const text = typeof value === "string" ? value : value?.value;
  return text?.trim() || undefined;
}

function shortDescriptionOf(
  synopsis?: string,
  firstSentence?: string | string[],
): string | undefined {
  const sentence = Array.isArray(firstSentence)
    ? firstSentence[0]
    : firstSentence;
  const source = sentence?.trim() || synopsis?.split(/\n\s*\n|\n/)[0]?.trim();
  return source ? source.slice(0, 280) : undefined;
}

/** Open Library search records omit full descriptions, so resolve the work. */
async function openLibraryWorkDescription(
  workKey?: string,
): Promise<string | undefined> {
  if (!workKey) return undefined;
  const res = await fetch(`${OL}${workKey}.json`, {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!res?.ok) return undefined;
  const work = (await res.json()) as {
    description?: string | { value?: string };
  };
  return descriptionText(work.description);
}

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
  const workKey = data.works?.[0]?.key;
  const synopsis = await openLibraryWorkDescription(workKey);

  return {
    type: "BOOK",
    title: data.subtitle ? `${data.title}: ${data.subtitle}` : data.title,
    coverImageUrl: `${OL_COVERS}/b/isbn/${clean}-L.jpg`,
    shortDescription: shortDescriptionOf(synopsis),
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
  page = 1,
  pageSize = limit,
): Promise<MediaCandidate[]> {
  const url = new URL(`${OL}/search.json`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  if (page > 1) {
    url.searchParams.set("offset", String((page - 1) * pageSize));
  }
  url.searchParams.set(
    "fields",
    "key,title,subtitle,first_publish_year,cover_i,isbn,language,author_name,number_of_pages_median,publisher,first_sentence",
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
      first_sentence?: string | string[];
    }[];
  };

  return Promise.all(
    (data.docs ?? []).filter((d) => d.title).map(async (d) => {
      const isbn = d.isbn?.[0];
      const synopsis = await openLibraryWorkDescription(d.key);
      const externalIds: MediaCandidate["externalIds"] = [
        { source: "OPEN_LIBRARY", value: d.key, url: `${OL}${d.key}` },
      ];
      if (isbn) externalIds.push({ source: "ISBN", value: isbn });
      return {
        type: "BOOK" as const,
        title: d.title!,
        subtitle: d.subtitle,
        coverImageUrl: d.cover_i
          ? `${OL_COVERS}/b/id/${d.cover_i}-L.jpg`
          : isbn
            ? `${OL_COVERS}/b/isbn/${isbn}-L.jpg`
            : undefined,
        shortDescription: shortDescriptionOf(synopsis, d.first_sentence),
        synopsis,
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
    }),
  );
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

export interface ImportedEpisode {
  number: number;
  title?: string;
  synopsis?: string;
  director?: string;
  runtimeMinutes?: number;
  airDate?: string;
}
/** Show-level crew credit captured during an episode-guide import. */
export interface ImportedShowCredit {
  role: "CREATOR" | "DIRECTOR";
  name: string;
}
export interface ImportedSeason {
  number: number;
  title?: string;
  airDate?: string;
  episodes: ImportedEpisode[];
}

/** Resolve a TMDB tv id from (in order) a stored TMDB id, an IMDB id (exact via
 *  /find), or a title search. Returns null if nothing matches. */
async function resolveTmdbTvId(
  opts: { tmdbId?: string; imdbId?: string; title?: string },
  apiKey: string,
): Promise<number | null> {
  if (opts.tmdbId && /^\d+$/.test(opts.tmdbId)) return Number(opts.tmdbId);
  if (opts.imdbId) {
    const r = await fetch(
      `${TMDB}/find/${opts.imdbId}?external_source=imdb_id&api_key=${apiKey}`,
      { headers: { Accept: "application/json" } },
    );
    if (r.ok) {
      const d = (await r.json()) as { tv_results?: { id: number }[] };
      if (d.tv_results?.[0]?.id) return d.tv_results[0].id;
    }
  }
  if (opts.title) {
    const u = new URL(`${TMDB}/search/tv`);
    u.searchParams.set("query", opts.title);
    u.searchParams.set("api_key", apiKey);
    const r = await fetch(u, { headers: { Accept: "application/json" } });
    if (r.ok) {
      const d = (await r.json()) as { results?: { id: number }[] };
      if (d.results?.[0]?.id) return d.results[0].id;
    }
  }
  return null;
}

/**
 * Fetch a show's full season/episode list from TMDB for import. Skips season 0
 * (specials). Returns the resolved TMDB tv id (so callers can persist it) and
 * the seasons with their episodes.
 */
export async function importTmdbSeasons(
  opts: { tmdbId?: string; imdbId?: string; title?: string },
  apiKey?: string,
): Promise<{
  tvId: number | null;
  seasons: ImportedSeason[];
  credits: ImportedShowCredit[];
}> {
  if (!apiKey) {
    throw new Error(
      "TMDB lookup is not configured. Set TMDB_API_KEY (wrangler secret put TMDB_API_KEY).",
    );
  }
  const tvId = await resolveTmdbTvId(opts, apiKey);
  if (tvId == null) return { tvId: null, seasons: [], credits: [] };

  const showRes = await fetch(`${TMDB}/tv/${tvId}?api_key=${apiKey}`, {
    headers: { Accept: "application/json" },
  });
  if (!showRes.ok) return { tvId, seasons: [], credits: [] };
  const show = (await showRes.json()) as {
    created_by?: { name?: string }[];
    seasons?: { season_number: number; name?: string; air_date?: string }[];
  };

  // Show-level creators.
  const credits: ImportedShowCredit[] = (show.created_by ?? [])
    .map((c) => c.name)
    .filter((n): n is string => Boolean(n))
    .map((name) => ({ role: "CREATOR" as const, name }));

  const seasons: ImportedSeason[] = [];
  for (const s of (show.seasons ?? []).filter((s) => s.season_number >= 1)) {
    const sr = await fetch(
      `${TMDB}/tv/${tvId}/season/${s.season_number}?api_key=${apiKey}`,
      { headers: { Accept: "application/json" } },
    );
    if (!sr.ok) continue;
    const sd = (await sr.json()) as {
      episodes?: {
        episode_number: number;
        name?: string;
        overview?: string;
        runtime?: number;
        air_date?: string;
        crew?: { job?: string; name?: string }[];
      }[];
    };
    seasons.push({
      number: s.season_number,
      title: s.name || undefined,
      airDate: s.air_date || undefined,
      episodes: (sd.episodes ?? []).map((e) => ({
        number: e.episode_number,
        title: e.name || undefined,
        synopsis: e.overview || undefined,
        // Per-episode director from the season's crew list (TMDB only).
        director: (e.crew ?? []).find((x) => x.job === "Director")?.name,
        runtimeMinutes: e.runtime || undefined,
        airDate: e.air_date || undefined,
      })),
    });
  }
  return { tvId, seasons, credits };
}

// ---------------------------------------------------------------------------
// TV episode guides — TVmaze (free, keyless, CC BY-SA). Preferred source since
// it needs no API key; TMDB above is an optional fallback when a key is set.
// ---------------------------------------------------------------------------

const TVMAZE = "https://api.tvmaze.com";

/** Strip HTML tags from TVmaze summaries (they're returned as `<p>…</p>`). */
function stripHtml(s?: string): string | undefined {
  if (!s) return undefined;
  const t = s.replace(/<[^>]*>/g, "").trim();
  return t || undefined;
}

async function resolveTvmazeId(opts: {
  imdbId?: string;
  title?: string;
}): Promise<number | null> {
  if (opts.imdbId) {
    const r = await fetch(
      `${TVMAZE}/lookup/shows?imdb=${encodeURIComponent(opts.imdbId)}`,
      { headers: { Accept: "application/json" } },
    );
    if (r.ok) {
      const d = (await r.json()) as { id?: number };
      if (d?.id) return d.id;
    }
  }
  if (opts.title) {
    const r = await fetch(
      `${TVMAZE}/singlesearch/shows?q=${encodeURIComponent(opts.title)}`,
      { headers: { Accept: "application/json" } },
    );
    if (r.ok) {
      const d = (await r.json()) as { id?: number };
      if (d?.id) return d.id;
    }
  }
  return null;
}

/** Full season/episode guide from TVmaze, plus show-level crew. TVmaze does not
 *  expose per-episode directors, so `episode.director` stays undefined here.
 *  Skips season 0 (specials). */
export async function importTvmazeSeasons(opts: {
  imdbId?: string;
  title?: string;
}): Promise<{ seasons: ImportedSeason[]; credits: ImportedShowCredit[] }> {
  const showId = await resolveTvmazeId(opts);
  if (showId == null) return { seasons: [], credits: [] };

  const [seasonsRes, epsRes, crewRes] = await Promise.all([
    fetch(`${TVMAZE}/shows/${showId}/seasons`, {
      headers: { Accept: "application/json" },
    }),
    fetch(`${TVMAZE}/shows/${showId}/episodes`, {
      headers: { Accept: "application/json" },
    }),
    fetch(`${TVMAZE}/shows/${showId}/crew`, {
      headers: { Accept: "application/json" },
    }),
  ]);
  if (!epsRes.ok) return { seasons: [], credits: [] };

  // Show-level crew → Creator/Director credits (dedup by name).
  const crew = crewRes.ok
    ? ((await crewRes.json()) as { type?: string; person?: { name?: string } }[])
    : [];
  const seen = new Set<string>();
  const credits: ImportedShowCredit[] = [];
  for (const c of crew) {
    const name = c.person?.name;
    const role =
      c.type === "Creator" ? "CREATOR" : c.type === "Director" ? "DIRECTOR" : null;
    if (!name || !role || seen.has(`${role}:${name}`)) continue;
    seen.add(`${role}:${name}`);
    credits.push({ role, name });
  }
  const seasonMeta = seasonsRes.ok
    ? ((await seasonsRes.json()) as {
        number: number;
        name?: string;
        premiereDate?: string;
      }[])
    : [];
  const eps = (await epsRes.json()) as {
    season: number;
    number: number | null;
    name?: string;
    airdate?: string;
    runtime?: number | null;
    summary?: string;
  }[];

  const byNumber = new Map<number, ImportedSeason>();
  for (const m of seasonMeta) {
    byNumber.set(m.number, {
      number: m.number,
      title: m.name || undefined,
      airDate: m.premiereDate || undefined,
      episodes: [],
    });
  }
  for (const e of eps) {
    if (e.season == null || e.number == null) continue; // skip specials w/o number
    let s = byNumber.get(e.season);
    if (!s) {
      s = { number: e.season, episodes: [] };
      byNumber.set(e.season, s);
    }
    s.episodes.push({
      number: e.number,
      title: e.name || undefined,
      synopsis: stripHtml(e.summary),
      runtimeMinutes: e.runtime || undefined,
      airDate: e.airdate || undefined,
    });
  }
  const seasons = [...byNumber.values()]
    .filter((s) => s.number >= 1)
    .sort((a, b) => a.number - b.number);
  return { seasons, credits };
}

/**
 * Import a show's season/episode guide, open sources first: TVmaze (free,
 * keyless) is tried first; TMDB is used only as a fallback when a key is set.
 */
export async function importSeasons(
  opts: { tmdbId?: string; imdbId?: string; title?: string },
  env: { TMDB_API_KEY?: string },
): Promise<{
  source: "tvmaze" | "tmdb" | null;
  tvId: number | null;
  seasons: ImportedSeason[];
  credits: ImportedShowCredit[];
}> {
  const tvmaze = await importTvmazeSeasons(opts).catch(() => ({
    seasons: [] as ImportedSeason[],
    credits: [] as ImportedShowCredit[],
  }));
  if (tvmaze.seasons.length)
    return {
      source: "tvmaze",
      tvId: null,
      seasons: tvmaze.seasons,
      credits: tvmaze.credits,
    };

  if (env.TMDB_API_KEY) {
    const tmdb = await importTmdbSeasons(opts, env.TMDB_API_KEY).catch(() => ({
      tvId: null,
      seasons: [] as ImportedSeason[],
      credits: [] as ImportedShowCredit[],
    }));
    if (tmdb.seasons.length)
      return {
        source: "tmdb",
        tvId: tmdb.tvId,
        seasons: tmdb.seasons,
        credits: tmdb.credits,
      };
  }
  return { source: null, tvId: null, seasons: [], credits: [] };
}

// ---------------------------------------------------------------------------
// Movies / TV — Wikidata (CC0, commercial-safe, keyless)
// ---------------------------------------------------------------------------

const WD_SPARQL = "https://query.wikidata.org/sparql";
// film, TV film, film series, documentary film, animated film
const WD_MOVIE = new Set([
  "Q11424",
  "Q506240",
  "Q24856",
  "Q93204",
  "Q202866",
]);
// TV series, miniseries, anime series, web series, animated TV series
const WD_TV = new Set([
  "Q5398426",
  "Q1259759",
  "Q63952888",
  "Q526877",
  "Q581714",
]);

// Shared SELECT + body (everything after the item selector) for the movie/TV
// queries, so both free-text search and series-member lookup parse identically.
const SCREEN_SELECT =
  "SELECT ?item ?itemLabel ?itemDescription ?type ?date ?image ?imdb ?directorLabel ?runtime ?seasons ?episodes ?genreLabel ?series ?seriesLabel ?ordinal";
const SCREEN_BODY = `
  ?item wdt:P31 ?type .
  VALUES ?type { wd:Q11424 wd:Q506240 wd:Q24856 wd:Q93204 wd:Q202866 wd:Q5398426 wd:Q1259759 wd:Q63952888 wd:Q526877 wd:Q581714 }
  OPTIONAL { ?item wdt:P577 ?date . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wdt:P345 ?imdb . }
  OPTIONAL { ?item wdt:P57 ?director . }
  OPTIONAL { ?item wdt:P2047 ?runtime . }
  OPTIONAL { ?item wdt:P2437 ?seasons . }
  OPTIONAL { ?item wdt:P1113 ?episodes . }
  OPTIONAL { ?item wdt:P136 ?genre . }`;
const SCREEN_LABEL = `  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }`;

/** Run a movie/TV SPARQL query and dedupe rows into candidates. */
async function runScreenQuery(sparql: string): Promise<MediaCandidate[]> {
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
    const setSeries = (cand: MediaCandidate) => {
      if (b.seriesLabel?.value && !cand.seriesName) {
        cand.seriesName = b.seriesLabel.value;
        cand.seriesId = b.series?.value?.split("/").pop();
        const ord = Number(b.ordinal?.value);
        if (ord) cand.seriesPosition = ord;
      }
    };

    const existing = byId.get(qid);
    if (existing) {
      if (director && type === "MOVIE") addCredit(existing, "DIRECTOR", director);
      if (genre && !existing.genre) existing.genre = genre;
      setSeries(existing);
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
    setSeries(candidate);

    byId.set(qid, candidate);
  }
  return [...byId.values()];
}

/**
 * Movie/TV lookup via Wikidata — CC0, safe for commercial use. Returns
 * metadata; poster images come from Wikimedia Commons (P18) only when a
 * freely-licensed file exists, so many titles have no cover.
 */
export async function searchScreenWikidata(
  query: string,
  offset = 0,
  limit = 40,
): Promise<MediaCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const sparql = `${SCREEN_SELECT} WHERE {
  {
    SELECT ?item WHERE {
      SERVICE wikibase:mwapi {
        bd:serviceParam wikibase:api "EntitySearch" .
        bd:serviceParam wikibase:endpoint "www.wikidata.org" .
        bd:serviceParam mwapi:search ${JSON.stringify(q)} .
        bd:serviceParam mwapi:language "en" .
        bd:serviceParam mwapi:limit "${limit}" .
        ${offset > 0 ? `bd:serviceParam mwapi:continue "${offset}" .` : ""}
        ?item wikibase:apiOutputItem mwapi:item .
      }
    } LIMIT ${limit}
  }${SCREEN_BODY}
  OPTIONAL { ?item p:P179 ?ps . ?ps ps:P179 ?series . OPTIONAL { ?ps pq:P1545 ?ordinal . } }
${SCREEN_LABEL}
}`;
  return runScreenQuery(sparql);
}

/**
 * All movie/TV members of a Wikidata series (by QID), each carrying its series
 * ordinal so they can be imported + linked in reading/release order.
 */
export async function searchWikidataSeriesMembers(
  seriesQid: string,
): Promise<MediaCandidate[]> {
  if (!/^Q\d+$/.test(seriesQid)) return [];
  const sparql = `${SCREEN_SELECT} WHERE {
  ?item p:P179 ?ps .
  ?ps ps:P179 wd:${seriesQid} .
  BIND(wd:${seriesQid} AS ?series)
  OPTIONAL { ?ps pq:P1545 ?ordinal . }${SCREEN_BODY}
${SCREEN_LABEL}
} LIMIT 100`;
  const members = await runScreenQuery(sparql);
  return members.sort(
    (a, b) => (a.seriesPosition ?? 1e9) - (b.seriesPosition ?? 1e9),
  );
}

function normalizeDate(input?: string): string | undefined {
  if (!input) return undefined;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().slice(0, 10);
}
