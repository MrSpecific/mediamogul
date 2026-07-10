// Generates public/og.png (1200x630) from an inline SVG. Run: node scripts/gen-og.mjs
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1b1710"/><stop offset="1" stop-color="#0c0a06"/>
    </linearGradient>
    <linearGradient id="mg" x1="0" y1="0" x2="150" y2="150" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFD24A"/><stop offset="1" stop-color="#E0871B"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(150 205)">
    <rect width="150" height="150" rx="34" fill="url(#mg)"/>
    <path d="M56 46 L108 75 L56 104 Z" fill="#1a1608"/>
  </g>
  <text x="336" y="292" font-family="system-ui, Arial, sans-serif" font-size="96" font-weight="800" fill="#ffffff">mediamogul</text>
  <text x="338" y="356" font-family="system-ui, Arial, sans-serif" font-size="34" font-weight="500" fill="#EBB94A">Track everything you watch, read, and listen to.</text>
  <text x="152" y="452" font-family="system-ui, Arial, sans-serif" font-size="26" fill="#8f887a">Movies · TV · Books · Audiobooks · Magazines</text>
</svg>`;

writeFileSync("public/og.svg", svg);
await sharp(Buffer.from(svg)).png().toFile("public/og.png");
console.log("Wrote public/og.png + public/og.svg");
