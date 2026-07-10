// Finds Creative-Commons-licensed images via Openverse — a keyless aggregator
// of CC/public-domain images from Flickr, Wikimedia Commons, museums, and more.
// Filtered to commercially-usable licenses (important for this app). Official
// posters are copyrighted and won't appear; results are CC alternatives the
// user picks from.

export interface CoverCandidate {
  url: string;
  thumbnail: string;
  title?: string;
  creator?: string;
  license?: string;
  source?: string;
  sourceUrl?: string;
}

const OPENVERSE = "https://api.openverse.org/v1/images/";

export async function searchCovers(query: string): Promise<CoverCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  const url = new URL(OPENVERSE);
  url.searchParams.set("q", q);
  // Only licenses that permit commercial use.
  url.searchParams.set("license_type", "commercial");
  url.searchParams.set("page_size", "24");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "mediamogul/1.0 (media consumption tracker)",
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: {
      url?: string;
      thumbnail?: string;
      title?: string;
      creator?: string;
      license?: string;
      license_version?: string;
      source?: string;
      foreign_landing_url?: string;
    }[];
  };

  return (data.results ?? [])
    .filter((r): r is { url: string } & typeof r => Boolean(r.url))
    .map((r) => ({
      url: r.url,
      thumbnail: r.thumbnail ?? r.url,
      title: r.title,
      creator: r.creator,
      license: [r.license, r.license_version]
        .filter(Boolean)
        .join(" ")
        .toUpperCase(),
      source: r.source,
      sourceUrl: r.foreign_landing_url,
    }));
}
