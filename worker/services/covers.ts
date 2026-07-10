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

export async function searchCovers(query: string): Promise<CoverCandidate[]> {
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
    iiurlwidth: "300",
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
        url: info.url,
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
