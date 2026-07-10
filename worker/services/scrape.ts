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
  };
  if (!data.title) return null;

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
    "key,title,subtitle,first_publish_year,cover_i,isbn,language",
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
        externalIds,
      };
    });
}

/**
 * Movie/TV lookup via TMDB. Requires a TMDB_API_KEY secret
 * (`wrangler secret put TMDB_API_KEY`). Left as a stub so the pattern is clear
 * without shipping a hard dependency on a key — see PLAN.md.
 */
export async function searchScreen(
  _query: string,
  apiKey?: string,
): Promise<MediaCandidate[]> {
  if (!apiKey) {
    throw new Error(
      "TMDB lookup is not configured. Set TMDB_API_KEY (wrangler secret put TMDB_API_KEY).",
    );
  }
  // TODO: implement TMDB /search/multi and map results to MediaCandidate.
  return [];
}

function normalizeDate(input?: string): string | undefined {
  if (!input) return undefined;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().slice(0, 10);
}
