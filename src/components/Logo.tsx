/** The mediamogul mark: a gold "play tile" (media) — scales cleanly to favicon. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      role="img"
    >
      <defs>
        <linearGradient
          id="mm-grad"
          x1="8"
          y1="8"
          x2="56"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFD24A" />
          <stop offset="1" stopColor="#E0871B" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="48" height="48" rx="13" fill="url(#mm-grad)" />
      <path d="M27 23.5 L43 32 L27 40.5 Z" fill="#1a1608" />
    </svg>
  );
}

/** Icon + wordmark, for the header. */
export function Logo() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <LogoMark size={26} />
      <span>mediamogul</span>
    </span>
  );
}
