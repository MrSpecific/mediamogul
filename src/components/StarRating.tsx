interface StarRatingProps {
  /** Current value in stars (supports halves, e.g. 3.5). */
  value: number | null;
  /** Provide to make it interactive; omit for read-only display. */
  onChange?: (value: number) => void;
  /** Font size in px. */
  size?: number;
}

/** A 0.5–5 half-star rating control. Left half of a star = x.5, right = x.0. */
export function StarRating({ value, onChange, size = 22 }: StarRatingProps) {
  const v = value ?? 0;
  const interactive = Boolean(onChange);

  return (
    <div className="stars" style={{ fontSize: size }} role="img" aria-label={`${v} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, v - (star - 1)));
        return (
          <span className="star" key={star}>
            <span className="star-bg">★</span>
            <span className="star-fg" style={{ width: `${fill * 100}%` }}>
              ★
            </span>
            {interactive && (
              <>
                <button
                  type="button"
                  className="star-hit left"
                  aria-label={`${star - 0.5} stars`}
                  onClick={() => onChange?.(star - 0.5)}
                />
                <button
                  type="button"
                  className="star-hit right"
                  aria-label={`${star} stars`}
                  onClick={() => onChange?.(star)}
                />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
