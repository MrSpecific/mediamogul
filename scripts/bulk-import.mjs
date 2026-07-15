// Bulk-import media by title/query via the Worker's batch endpoint.
//
// Usage:
//   node scripts/bulk-import.mjs "Dune" "The Matrix" "The Wire"
//   node scripts/bulk-import.mjs --type MOVIE "Dune" "Blade Runner"
//   node scripts/bulk-import.mjs --file titles.txt          # one query per line
//   echo "Dune\nThe Wire" | node scripts/bulk-import.mjs     # or pipe via stdin
//
// Config (env or .dev.vars):
//   BATCH_TOKEN   — required; must match the Worker's BATCH_TOKEN secret.
//   BASE_URL      — API origin (default http://localhost:5173). Override with --url.
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".dev.vars" }); // also picks up BATCH_TOKEN / BASE_URL if set there

const args = process.argv.slice(2);
let type;
let file;
let baseUrl = process.env.BASE_URL || "http://localhost:5173";
const queries = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--type") type = args[++i];
  else if (a === "--file") file = args[++i];
  else if (a === "--url") baseUrl = args[++i];
  else queries.push(a);
}

if (file) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (t) queries.push(t);
  }
}
if (queries.length === 0 && !process.stdin.isTTY) {
  const stdin = readFileSync(0, "utf8");
  for (const line of stdin.split("\n")) {
    const t = line.trim();
    if (t) queries.push(t);
  }
}

const token = process.env.BATCH_TOKEN;
if (!token) {
  console.error("BATCH_TOKEN is not set (env or .dev.vars).");
  process.exit(1);
}
if (queries.length === 0) {
  console.error("No queries. Pass titles as args, --file <path>, or via stdin.");
  process.exit(1);
}

const items = queries.map((query) => (type ? { query, type } : { query }));
console.log(`Importing ${items.length} item(s) via ${baseUrl} …`);

const res = await fetch(`${baseUrl}/api/batch/import`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ items }),
});

if (!res.ok) {
  console.error(`Request failed: ${res.status}`, await res.text());
  process.exit(1);
}

const { summary, results } = await res.json();
for (const r of results) {
  const label =
    r.status === "imported" || r.status === "exists"
      ? `${r.status.padEnd(8)} ${r.type ?? ""}  ${r.title ?? ""}`
      : `${r.status.padEnd(8)} ${r.error ?? ""}`;
  console.log(`  ${r.query}  →  ${label}`);
}
console.log("Summary:", summary);
