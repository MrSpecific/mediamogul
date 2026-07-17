/**
 * Two-letter initials for an avatar placeholder: the first letter of each of
 * the first two words (e.g. "Will Christenson" → "WC"). Falls back to the first
 * two letters of a single word ("madonna" → "MA"), and "?" when there's nothing
 * usable. Handles usernames, display names, or an email local part alike.
 */
export function getInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
