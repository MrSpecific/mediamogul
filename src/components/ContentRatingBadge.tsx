import type { ContentRatingRef } from "../lib/types";

const SYSTEM_LABEL: Record<string, string> = {
  MPAA: "MPAA film rating",
  US_TV: "US TV Parental Guidelines",
};

/**
 * A content/maturity rating shown the way people expect to see it: the code
 * (e.g. "PG-13", "TV-MA") in a bordered certificate-style box, with the full
 * name + system on hover. Styling lives in styles.css (.content-rating-badge).
 */
export function ContentRatingBadge({
  rating,
  size = "2",
}: {
  rating: Pick<ContentRatingRef, "code" | "name" | "system">;
  size?: "1" | "2";
}) {
  const system = SYSTEM_LABEL[rating.system] ?? rating.system;
  return (
    <span
      className="content-rating-badge"
      data-size={size}
      data-system={rating.system}
      title={`${rating.name} — ${system}`}
    >
      {rating.code}
    </span>
  );
}
