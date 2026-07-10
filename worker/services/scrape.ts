import type { ExternalSource, MediaType } from "../generated/prisma/client";

/**
 * A normalized, not-yet-saved catalog candidate. The lookup endpoints return
 * these so the client can preview/edit before creating a MediaItem.
 */
export interface MediaCandidate {
  type: MediaType;
  title: string;
  coverImageUrl?: string;
  shortDescription?: string;
  synopsis?: string;
  releaseDate?: string; // ISO date
  originalLanguage?: string;
  metadata?: Record<string, unknown>;
  externalIds: { source: ExternalSource; value: string; url?: string }[];
}

const OL = "https://openlibrary.org";
const OL_COVERS = "https://covers.openlibrary.org";

/**
 * Open Library book lookup by ISBN. Keyless and public — a good default for
 * the "help me add media" flow for books.
 */
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
      (data.authors ?? []).slice(0, 3).map(async (a) => {
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
    metadata: {
      pageCount: data.number_of_pages,
      publisher: data.publishers?.[0],
      author: authors.length ? authors.join(", ") : undefined,
    },
    externalIds: [
      { source: "ISBN", value: clean },
      {
        source: "OPEN_LIBRARY",
        value: clean,
        url: `${OL}/isbn/${clean}`,
      },
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
    "key,title,subtitle,first_publish_year,cover_i,isbn,language,author_name",
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
        metadata: d.author_name?.length
          ? { author: d.author_name.slice(0, 3).join(", ") }
          : undefined,
        externalIds,
      };
    });
}

const TMDB = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

interface TmdbResult {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string; // movie
  name?: string; // tv
  overview?: string;
  poster_path?: string | null;
  release_date?: string; // movie
  first_air_date?: string; // tv
  original_language?: string;
  popularity?: number;
}

/** Director (movie) or creator/showrunner (tv) via TMDB, one call per title. */
async function tmdbCredit(
  kind: "movie" | "tv",
  id: number,
  apiKey: string,
): Promise<string | undefined> {
  try {
    if (kind === "movie") {
      const r = await fetch(`${TMDB}/movie/${id}/credits?api_key=${apiKey}`, {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) return undefined;
      const c = (await r.json()) as { crew?: { job: string; name: string }[] };
      return c.crew?.find((x) => x.job === "Director")?.name;
    }
    const r = await fetch(`${TMDB}/tv/${id}?api_key=${apiKey}`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return undefined;
    const c = (await r.json()) as { created_by?: { name: string }[] };
    const names = (c.created_by ?? []).map((x) => x.name).filter(Boolean);
    return names.length ? names.join(", ") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Movie/TV lookup via TMDB `/search/multi`, enriched with director/showrunner.
 * Requires a TMDB_API_KEY secret (`wrangler secret put TMDB_API_KEY`) — a v3 key.
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
  // Fetch credits for all results in parallel.
  const credits = await Promise.all(
    items.map((r) => tmdbCredit(r.media_type as "movie" | "tv", r.id, apiKey)),
  );

  return items.map((r, i) => {
    const isTv = r.media_type === "tv";
    const kind = isTv ? "tv" : "movie";
    const date = isTv ? r.first_air_date : r.release_date;
    return {
      type: isTv ? ("TV_SHOW" as const) : ("MOVIE" as const),
      title: (isTv ? r.name : r.title) ?? "Untitled",
      coverImageUrl: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : undefined,
      shortDescription: r.overview?.slice(0, 280) || undefined,
      synopsis: r.overview || undefined,
      releaseDate: normalizeDate(date),
      originalLanguage: r.original_language,
      metadata: {
        tmdbPopularity: r.popularity,
        ...(isTv ? { showrunner: credits[i] } : { director: credits[i] }),
      },
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

function normalizeDate(input?: string): string | undefined {
  if (!input) return undefined;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().slice(0, 10);
}
