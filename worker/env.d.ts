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
   * OPTIONAL, non-commercial TMDB API key. The app prefers free, keyless,
   * open sources and does NOT require this:
   *   - Movies/TV lookup  → Wikidata (CC0)
   *   - Books             → Open Library
   *   - TV episode guides → TVmaze (CC BY-SA, keyless)
   * TMDB is only used as a richer fallback when a key is set. Leave unset to
   * run entirely on open sources. Set via `wrangler secret put TMDB_API_KEY`.
   */
  TMDB_API_KEY?: string;

  /** Stripe billing (all via `wrangler secret put …`). Optional until billing is wired. */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** Stripe Price id for the Standard plan. */
  STRIPE_PRICE_STANDARD?: string;
}
