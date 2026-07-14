/** Small inline loading spinner (CSS-only; see `.spinner` in styles.css). */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="spinner"
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
    />
  );
}
