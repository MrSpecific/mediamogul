// Native human-friendly time display via Intl.RelativeTimeFormat.

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const DIVISIONS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** e.g. "3 days ago", "in 2 hours", "just now". */
export function timeAgo(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  const secs = (date.getTime() - Date.now()) / 1000; // negative = past
  const abs = Math.abs(secs);
  if (abs < 45) return "just now";
  for (const [unit, s] of DIVISIONS) {
    if (abs >= s) return rtf.format(Math.round(secs / s), unit);
  }
  return "just now";
}

/** Absolute date, e.g. "Jan 5, 2026" (for tooltips / precise display). */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
