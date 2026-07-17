// Generates the PWA app icons from the brand mark. Run: node scripts/gen-icons.mjs
//
// One source SVG (the gold "play tile" on the brand-dark background) is rendered
// to every size the manifest + iOS need. The logo sits within the centre ~62%
// so the 512 image doubles as a maskable icon (content inside the safe zone).
import sharp from "sharp";

const icon = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1b1710"/><stop offset="1" stop-color="#0c0a06"/>
    </linearGradient>
    <linearGradient id="mg" x1="96" y1="96" x2="416" y2="416" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFD24A"/><stop offset="1" stop-color="#E0871B"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(96 96)">
    <rect width="320" height="320" rx="72" fill="url(#mg)"/>
    <path d="M119 98 L230 160 L119 222 Z" fill="#1a1608"/>
  </g>
</svg>`;

const buf = Buffer.from(icon);
const targets = [
  { file: "public/pwa-192.png", size: 192 },
  { file: "public/pwa-512.png", size: 512 },
  { file: "public/pwa-512-maskable.png", size: 512 },
  { file: "public/apple-touch-icon.png", size: 180 },
];

for (const { file, size } of targets) {
  await sharp(buf).resize(size, size).png().toFile(file);
  console.log("Wrote", file);
}
