# mediamogul

A platform for tracking media consumption — movies, TV, books, and magazines —
with a shared catalog, consumption history, ratings, reviews, following, and
lists. Deployed as a **single Cloudflare Worker** serving both the SPA and API.

| Layer | Tech | Where |
| --- | --- | --- |
| Frontend | React 19 + Vite SPA, `react-router-dom` v7 | [`src/`](src/) |
| UI | [`@wlcr/base-ic`](https://base-ic.vercel.app) (Base UI + CSS Modules/tokens — **no Tailwind**) | [`src/components/`](src/components/), [`src/pages/`](src/pages/) |
| Backend | [Hono](https://hono.dev) API | [`worker/`](worker/) |
| Database | [Neon](https://neon.tech) Postgres + [Prisma 7](https://www.prisma.io) | [`prisma/schema.prisma`](prisma/schema.prisma) |
| Auth | [Neon Auth](https://neon.tech/docs/neon-auth) (Better Auth) — email/password + Google | [`src/auth.ts`](src/auth.ts), [`worker/auth.ts`](worker/auth.ts) |
| Billing config | tier/pricing single source of truth | [`shared/tiers.ts`](shared/tiers.ts) |
| Hosting | Cloudflare Workers + static assets | [`wrangler.jsonc`](wrangler.jsonc) |

See [PLAN.md](PLAN.md) for the full data model, API surface, and roadmap.

## How it fits together

```
Request ─┬─ /api/*  → Hono ─ requireAuth (verify Neon Auth JWT) ─ Prisma ─ Neon
         └─ else    → React SPA (static assets), client-side routing
```

- One Worker, one `npm run deploy`. The `@cloudflare/vite-plugin` runs the real
  Worker inside Vite's dev server.
- Prisma uses the Rust-free `prisma-client` generator (`runtime = "workerd"`) +
  the Neon driver adapter — the setup that runs on Workers.
- The Neon Auth server is a separate origin, so the SPA sends the Neon Auth
  **JWT** as `Authorization: Bearer …`; the Worker verifies it against the
  JWKS at `<NEON_AUTH_URL>/.well-known/jwks.json`.

## Prerequisites

- Node 20+
- A [Neon](https://neon.tech) project with **Neon Auth** enabled
- A Cloudflare account (`npx wrangler login`)

## Setup

`@wlcr/base-ic` is on the public npm registry; the committed [`.npmrc`](.npmrc)
points the `@wlcr` scope there (overriding any global GitHub Packages route).

```bash
npm install                     # installs deps + generates the Prisma client

cp .env.example .env            # Prisma CLI DB connection string
cp .dev.vars.example .dev.vars  # DB connection string the Worker reads in dev
```

Fill in both env files:

- `DATABASE_URL` — Neon **pooled** connection string (Neon → Connection Details).
- `.env` also drives migrations; `.dev.vars` is read by the running Worker.

Add the Neon Auth URLs:

- `VITE_NEON_AUTH_URL` in `.env` — the client URL from **Neon Console → Auth →
  Configuration** (used by the browser; `VITE_`-prefixed so Vite exposes it).
- `NEON_AUTH_URL` in [`wrangler.jsonc`](wrangler.jsonc) `vars` — the **same**
  URL (the Worker verifies JWTs against `<NEON_AUTH_URL>/.well-known/jwks.json`).

### Non-secret config (`wrangler.jsonc` → `vars`)

These are plain config, committed in [`wrangler.jsonc`](wrangler.jsonc) (run
`npm run cf-typegen` after changing them):

| Var | Purpose |
| --- | --- |
| `NEON_AUTH_URL` | Neon Auth origin the Worker verifies JWTs against. |
| `ADMIN_EMAILS` | Comma-separated emails granted the admin role. Admin also resolves from the JWT's `user_metadata.role` (set a user to `admin` in Neon Auth); the allowlist is a reliable fallback. |
| `LIBBY_LIBRARY_KEY` | Any large public library's OverDrive key (default `lapl`) used to resolve stable Libby/OverDrive title ids. |

Then create the tables and generate types:

```bash
npm run db:push       # push schema.prisma to Neon (re-run after any schema change)
npm run cf-typegen    # regenerate worker-configuration.d.ts from wrangler.jsonc
```

> If you see `internal error; reference = …` from the API, the DB schema is
> usually out of sync — re-run `npm run db:push`.

### Optional integrations (secrets)

All optional — set as Wrangler secrets for production, or add to `.dev.vars`
for local dev (see [`.dev.vars.example`](.dev.vars.example)).

**Scrape-assist (open sources, no key required)** — everything works out of the
box on free, keyless, open data:

- **Books** → Open Library
- **Movies/TV** → Wikidata (CC0)
- **TV episode guides** → TVmaze (CC BY-SA) — powers one-click season/episode import

TMDB is an **optional** richer fallback for movie/TV metadata and episode guides.
It is not required; its free tier is non-commercial only. Set it only if you have
a key and accept those terms:

```bash
npx wrangler secret put TMDB_API_KEY          # OPTIONAL — a TMDB v3 API key
```

**Billing (Stripe)** — until all three are set, billing endpoints return `501`
and the app runs free-tier only. Setup:

1. In Stripe, create a product with a **recurring $1.99/mo price**; copy its
   price id (`price_…`). Amount/tiers are mirrored in
   [`shared/tiers.ts`](shared/tiers.ts).
2. Set the secrets (test-mode keys first):

   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY      # sk_test_… / sk_live_…
   npx wrangler secret put STRIPE_PRICE_STANDARD  # the price_… id
   npx wrangler secret put STRIPE_WEBHOOK_SECRET  # whsec_… (step 3)
   ```
3. Add a webhook endpoint in Stripe → `https://<your-domain>/api/billing/webhook`,
   subscribed to `customer.subscription.created`, `.updated`, and `.deleted`.
   Its signing secret is `STRIPE_WEBHOOK_SECRET`.

The webhook keeps `User.tier` in sync; tier limits/features are enforced
server-side ([`worker/tiers.ts`](worker/tiers.ts)).

**Local Stripe testing** — the CLI forwards events and prints a `whsec_…` to put
in `.dev.vars`:

```bash
stripe listen --forward-to localhost:5173/api/billing/webhook
stripe trigger customer.subscription.created   # or use card 4242 4242 4242 4242 in Checkout
```

### Google sign-in

Configure Google OAuth (client id/secret + authorized redirect URL) in
**Neon Console → Auth → Providers → Google**. No app secrets needed — the
"Continue with Google" button is already enabled in
[`src/providers/AuthProvider.tsx`](src/providers/AuthProvider.tsx).

## Develop

```bash
npm run dev           # http://localhost:5173 — SPA + /api on one origin, HMR
```

- `GET /api/` is public: `{"name":"mediamogul API","status":"ok"}`
- Every other `/api/*` route requires a signed-in session (401 otherwise).

## Deploy

```bash
npx wrangler login
npx wrangler secret put DATABASE_URL          # production DB secret (once)
npx wrangler r2 bucket create mediamogul       # cover-image uploads (once)
npm run deploy                                 # build + wrangler deploy
```

Uploaded cover images are stored in R2 (`MEDIA_BUCKET` binding) and served by
the Worker at `/uploads/<key>`. The storage layer
([`worker/services/storage.ts`](worker/services/storage.ts)) is an abstraction —
swap it for Cloudflare Images later without touching the UI or `MediaAsset` DB
model. Dev uses a local simulated bucket automatically (no setup needed).

## Project layout

```
src/
  main.tsx              Router + base-ic <Theme> + providers
  auth.ts               Neon Auth client + getAuthToken() (JWT for the API)
  providers/            AuthProvider (wires Neon Auth UI to react-router)
  components/           AppLayout, MediaCard, StarRating (half-star)
  pages/                Home, Catalog, AddMedia, MediaDetail, Lists, ListDetail, Profile
  lib/                  api.ts (bearer-token fetch), hooks.ts, types.ts
worker/
  index.ts              Hono app; mounts /api routes, health is public
  auth.ts               JWKS verify + requireAuth/requireAdmin + role resolution
  db.ts                 per-request Prisma client + getOrCreateUser
  routes/               me, users, media, lists, lookup, series, genres, billing
  services/             scrape (Open Library + Wikidata), covers (CC search),
                        libby (OverDrive), storage (R2), genres
  generated/prisma/     generated client (git-ignored)
shared/
  tiers.ts              billing tiers + feature flags (Free, Standard $1.99/mo)
prisma/schema.prisma    data model (snake_case tables, Prisma-style names)
prisma.config.ts        Prisma 7 CLI config
```

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server with the Worker in workerd |
| `npm run build` | Prisma generate + CF types + typecheck + build client & worker |
| `npm run deploy` | Build then `wrangler deploy` |
| `npm run db:push` | Push `schema.prisma` to Neon |
| `npm run db:migrate` / `db:deploy` | Create / apply migrations |
| `npm run db:studio` | Prisma Studio |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` |

## Notes

- **Secrets:** `.env`, `.dev.vars` are git-ignored. In production the Worker
  reads secrets (`DATABASE_URL`, Stripe, TMDB) from Wrangler secrets.
- **Neon Auth JWKS** is verified at `<NEON_AUTH_URL>/.well-known/jwks.json`
  ([`worker/auth.ts`](worker/auth.ts)).
- **Ratings** are half-star decimals (0.5–5).
- **Scrape-assist:** unified search across Open Library (books) + Wikidata
  (movies/TV) — both keyless. TV season/episode guides import from TVmaze
  (keyless, CC BY-SA). TMDB is an optional richer fallback only.
- **Cover art:** Creative-Commons search (Wikimedia Commons, Library of
  Congress), direct upload, or scraped from a linked source (Open Library,
  Libby/OverDrive); a CSS placeholder is generated when none exists.
