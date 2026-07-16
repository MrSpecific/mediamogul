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
  | "VIMEO";

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
];

const BY_VALUE = new Map(STREAMING_PROVIDERS.map((p) => [p.value, p]));

export function streamingLabel(p: StreamingProvider): string {
  return BY_VALUE.get(p)?.label ?? p;
}
export function streamingColor(p: StreamingProvider): string {
  return BY_VALUE.get(p)?.color ?? "#888";
}
