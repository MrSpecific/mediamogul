// Secrets are not part of the auto-generated `worker-configuration.d.ts`
// (which only reflects wrangler.jsonc bindings/vars), so declare them here.
// This ambient declaration merges into the global `Env` interface.
interface Env {
  /**
   * Neon Postgres connection string.
   * - Local dev: set in `.dev.vars`
   * - Production: `npx wrangler secret put DATABASE_URL`
   */
  DATABASE_URL: string;

  /**
   * Optional TMDB API key for movie/TV scrape-assist (books use keyless
   * Open Library). Set via `wrangler secret put TMDB_API_KEY`.
   */
  TMDB_API_KEY?: string;
}
