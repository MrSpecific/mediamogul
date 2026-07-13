// Finds Creative-Commons / public-domain images via Wikimedia Commons. Commons
// is all-free by policy and reachable from Workers (same infra as our Wikidata
// calls, unlike Openverse which blocks Cloudflare egress). Official posters are
// copyrighted and won't appear — results are CC alternatives the user picks.

export interface CoverCandidate {
  url: string;
  thumbnail: string;
  title?: string;
  creator?: string;
  license?: string;
  source: string;
  sourceUrl?: string;
}

export type CoverSource = "commons" | "loc";

export const COVER_SOURCES: { id: CoverSource; label: string }[] = [
  { id: "commons", label: "Wikimedia Commons" },
  { id: "loc", label: "Library of Congress" },
];

/** Dispatch to a single source (callers query sources in parallel). */
export function searchCovers(
  source: CoverSource,
  query: string,
): Promise<CoverCandidate[]> {
  return source === "loc" ? searchLoc(query) : searchCommons(query);
}

const COMMONS = "https://commons.wikimedia.org/w/api.php";

interface CommonsPage {
  title?: string;
  imageinfo?: {
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    mediatype?: string;
    extmetadata?: {
      LicenseShortName?: { value?: string };
      Artist?: { value?: string };
    };
  }[];
}

const stripHtml = (s?: string): string | undefined =>
  s
    ? s
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim() || undefined
    : undefined;

async function searchCommons(query: string): Promise<CoverCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  const url = new URL(COMMONS);
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrnamespace: "6", // File: namespace
    gsrsearch: q,
    gsrlimit: "24",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mediatype",
    // Scaled render (not the multi-MB original) — good cover size + small upload.
    iiurlwidth: "600",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "mediamogul/1.0 (media consumption tracker)",
    },
  });
  if (!res.ok) {
    console.error("Commons cover search failed", res.status);
    return [];
  }
  const data = (await res.json()) as {
    query?: { pages?: Record<string, CommonsPage> };
  };

  return Object.values(data.query?.pages ?? {}).flatMap((p) => {
    const info = p.imageinfo?.[0];
    if (!info?.url) return [];
    // Skip non-image files (video/audio/pdf).
    if (info.mediatype && info.mediatype !== "BITMAP" && info.mediatype !== "DRAWING") {
      return [];
    }
    const ex = info.extmetadata ?? {};
    return [
      {
        // Use the scaled render for both display and ingest (originals can be
        // tens of MB and exceed the upload cap).
        url: info.thumburl ?? info.url,
        thumbnail: info.thumburl ?? info.url,
        title: p.title?.replace(/^File:/, ""),
        creator: stripHtml(ex.Artist?.value),
        license: ex.LicenseShortName?.value,
        source: "Wikimedia Commons",
        sourceUrl: info.descriptionurl,
      },
    ];
  });
}

// --- Library of Congress (Prints & Photographs) --------------------------
// Keyless JSON API. Content is historical/archival; rights vary per item and
// aren't in the search payload, so results are labeled "verify rights".

const LOC = "https://www.loc.gov/pictures/search/";

async function searchLoc(query: string): Promise<CoverCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const url = new URL(LOC);
  url.searchParams.set("q", q);
  url.searchParams.set("fo", "json");
  url.searchParams.set("c", "40");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "mediamogul/1.0 (media consumption tracker)",
    },
  });
  if (!res.ok) {
    console.error("LoC cover search failed", res.status);
    return [];
  }
  const data = (await res.json()) as {
    results?: {
      title?: string;
      creator?: string;
      image?: { full?: string; thumb?: string };
      links?: { item?: string };
    }[];
  };

  return (data.results ?? []).flatMap((r) => {
    const full = r.image?.full ?? r.image?.thumb;
    if (!full) return [];
    return [
      {
        url: full,
        thumbnail: r.image?.thumb ?? full,
        title: r.title,
        creator: r.creator,
        license: "Library of Congress — verify rights",
        source: "Library of Congress",
        sourceUrl: r.links?.item,
      },
    ];
  });
}
