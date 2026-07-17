export type StreamingProvider =
  | "NETFLIX"
  | "MAX"
  | "APPLE_TV"
  | "HULU"
  | "PARAMOUNT_PLUS"
  | "DISNEY_PLUS"
  | "PRIME_VIDEO"
  | "PEACOCK"
  | "TUBI"
  | "STARZ"
  | "YOUTUBE"
  | "VIMEO"
  | "BBC_IPLAYER"
  | "BRITBOX"
  | "ABC"
  | "CBS"
  | "NBC"
  | "PBS"
  | "AMC_PLUS"
  | "CRUNCHYROLL"
  | "SHUDDER"
  | "MUBI"
  | "CRITERION_CHANNEL"
  | "PLUTO_TV"
  | "ROKU_CHANNEL";

/** Display config per provider (brand-ish accent for the badge). */
export const STREAMING_PROVIDERS: {
  value: StreamingProvider;
  label: string;
  color: string;
}[] = [
  { value: "NETFLIX", label: "Netflix", color: "#E50914" },
  { value: "MAX", label: "HBO Max", color: "#0046FF" },
  { value: "APPLE_TV", label: "Apple TV+", color: "#457bd6" },
  { value: "HULU", label: "Hulu", color: "#1CE783" },
  { value: "PARAMOUNT_PLUS", label: "Paramount+", color: "#0064FF" },
  { value: "DISNEY_PLUS", label: "Disney+", color: "#1a3fd6" },
  { value: "PRIME_VIDEO", label: "Prime Video", color: "#00A8E1" },
  { value: "PEACOCK", label: "Peacock", color: "#7d5fff" },
  { value: "TUBI", label: "Tubi", color: "#7408FF" },
  { value: "STARZ", label: "Starz", color: "#7d7d7d" },
  { value: "YOUTUBE", label: "YouTube", color: "#FF0000" },
  { value: "VIMEO", label: "Vimeo", color: "#1AB7EA" },
  { value: "BBC_IPLAYER", label: "BBC iPlayer", color: "#FF4C98" },
  { value: "BRITBOX", label: "BritBox", color: "#0F61FE" },
  { value: "ABC", label: "ABC", color: "#6E6E6E" },
  { value: "CBS", label: "CBS", color: "#003DA5" },
  { value: "NBC", label: "NBC", color: "#7C53C3" },
  { value: "PBS", label: "PBS", color: "#2638C4" },
  { value: "AMC_PLUS", label: "AMC+", color: "#DCA54C" },
  { value: "CRUNCHYROLL", label: "Crunchyroll", color: "#F47521" },
  { value: "SHUDDER", label: "Shudder", color: "#D5021D" },
  { value: "MUBI", label: "MUBI", color: "#3B51F5" },
  { value: "CRITERION_CHANNEL", label: "Criterion Channel", color: "#1D4E89" },
  { value: "PLUTO_TV", label: "Pluto TV", color: "#FFC800" },
  { value: "ROKU_CHANNEL", label: "Roku Channel", color: "#662D91" },
];

const BY_VALUE = new Map(STREAMING_PROVIDERS.map((p) => [p.value, p]));

export function streamingLabel(p: StreamingProvider): string {
  return BY_VALUE.get(p)?.label ?? p;
}
export function streamingColor(p: StreamingProvider): string {
  return BY_VALUE.get(p)?.color ?? "#888";
}

/** Domain → provider, for auto-detecting the provider from a pasted deep link.
 *  Matched against the hostname by exact or dot-suffix ("play.max.com"). More
 *  specific domains must come before their parents ("tv.apple.com"). */
const PROVIDER_DOMAINS: [string, StreamingProvider][] = [
  ["netflix.com", "NETFLIX"],
  ["max.com", "MAX"],
  ["hbomax.com", "MAX"],
  ["tv.apple.com", "APPLE_TV"],
  ["hulu.com", "HULU"],
  ["paramountplus.com", "PARAMOUNT_PLUS"],
  ["disneyplus.com", "DISNEY_PLUS"],
  ["primevideo.com", "PRIME_VIDEO"],
  ["amazon.com", "PRIME_VIDEO"],
  ["amazon.co.uk", "PRIME_VIDEO"],
  ["peacocktv.com", "PEACOCK"],
  ["tubitv.com", "TUBI"],
  ["tubi.tv", "TUBI"],
  ["starz.com", "STARZ"],
  ["youtube.com", "YOUTUBE"],
  ["youtu.be", "YOUTUBE"],
  ["vimeo.com", "VIMEO"],
  ["bbc.co.uk", "BBC_IPLAYER"],
  ["bbc.com", "BBC_IPLAYER"],
  ["britbox.com", "BRITBOX"],
  ["abc.com", "ABC"],
  ["cbs.com", "CBS"],
  ["nbc.com", "NBC"],
  ["pbs.org", "PBS"],
  ["amcplus.com", "AMC_PLUS"],
  ["crunchyroll.com", "CRUNCHYROLL"],
  ["shudder.com", "SHUDDER"],
  ["mubi.com", "MUBI"],
  ["criterionchannel.com", "CRITERION_CHANNEL"],
  ["pluto.tv", "PLUTO_TV"],
  ["therokuchannel.roku.com", "ROKU_CHANNEL"],
  ["roku.com", "ROKU_CHANNEL"],
];

/** Best-guess provider for a pasted URL, or null when unrecognized. */
export function providerFromUrl(raw: string): StreamingProvider | null {
  let host: string;
  try {
    host = new URL(raw.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  for (const [domain, provider] of PROVIDER_DOMAINS) {
    if (host === domain || host.endsWith(`.${domain}`)) return provider;
  }
  return null;
}
