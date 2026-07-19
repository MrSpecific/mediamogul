// True-up historic cover images: walks every media item whose cover is still a
// remote URL and ingests it into R2 via the Worker's batch endpoint, paging
// until done. Items whose source can't be fetched right now (Open Library
// covers redirect to archive.org, which 503s under load) keep their remote URL
// and are picked up again on the next run — safe to re-run any time.
//
// Usage:
//   node scripts/true-up-covers.mjs --url https://your-app.example.com
//   node scripts/true-up-covers.mjs --dry-run        # fetch/validate only
//   node scripts/true-up-covers.mjs --limit 5        # smaller pages
//
// IMPORTANT: run non-dry against the DEPLOYED worker. Local dev pairs the real
// database with a simulated local R2 bucket, so a local non-dry run would point
// production rows at objects that only exist on your machine.
//
// Config (env or .dev.vars):
//   BATCH_TOKEN   — required; must match the Worker's BATCH_TOKEN secret.
//   BASE_URL      — API origin (default http://localhost:5173). Override with --url.
import { config } from "dotenv";

config({ path: ".dev.vars" });

const args = process.argv.slice(2);
let baseUrl = process.env.BASE_URL || "http://localhost:5173";
let limit = 10;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--url") baseUrl = args[++i];
  else if (a === "--limit") limit = Number(args[++i]);
  else if (a === "--dry-run") dryRun = true;
  else {
    console.error(`Unknown argument: ${a}`);
    process.exit(1);
  }
}

const token = process.env.BATCH_TOKEN;
if (!token) {
  console.error("BATCH_TOKEN is not set (env or .dev.vars).");
  process.exit(1);
}
if (!dryRun && /localhost|127\.0\.0\.1/.test(baseUrl)) {
  console.error(
    "Refusing a non-dry run against localhost: local R2 is simulated but the\n" +
      "database is real, which would break production covers. Use --dry-run\n" +
      "here, or --url <deployed origin> for the real migration.",
  );
  process.exit(1);
}

console.log(
  `${dryRun ? "DRY RUN — " : ""}true-up via ${baseUrl} (pages of ${limit}) …`,
);

const totals = { stored: 0, fetchable: 0, failed: 0 };
let cursor;
let page = 0;

do {
  const res = await fetch(`${baseUrl}/api/batch/true-up-covers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ limit, dryRun, ...(cursor ? { cursor } : {}) }),
  });
  if (!res.ok) {
    console.error(`Request failed: ${res.status}`, await res.text());
    process.exit(1);
  }
  const { results, nextCursor } = await res.json();
  page += 1;
  for (const r of results) {
    totals[r.status] = (totals[r.status] ?? 0) + 1;
    const note = r.status === "failed" ? r.from : (r.url ?? "");
    console.log(`  ${r.status.padEnd(9)} ${r.title}  ${note}`);
  }
  console.log(`— page ${page} done (${results.length} item(s))`);
  cursor = nextCursor;
} while (cursor);

console.log("Totals:", totals);
if (totals.failed > 0) {
  console.log(
    "Failed covers keep their remote URL and will be retried on the next run\n" +
      "(archive.org availability varies hour to hour).",
  );
}
