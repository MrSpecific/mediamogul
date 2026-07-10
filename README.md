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
  JWKS at `<NEON_AUTH_URL>/jwt`.

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
  URL (the Worker verifies JWTs against `<NEON_AUTH_URL>/jwt`).

Then create the tables and generate types:

```bash
npm run db:push       # push schema.prisma to Neon (re-run after any schema change)
npm run cf-typegen    # regenerate worker-configuration.d.ts from wrangler.jsonc
```

> If you see `internal error; reference = …` from the API, the DB schema is
> usually out of sync — re-run `npm run db:push`.

### Optional integrations (secrets)

```bash
# Movie/TV scrape-assist (books work without this):
npx wrangler secret put TMDB_API_KEY          # a TMDB v3 API key

# Billing (Stripe) — create a Standard product/price first, then:
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET  # from your Stripe webhook endpoint
npx wrangler secret put STRIPE_PRICE_STANDARD  # the $1.99/mo price id
```

Point a Stripe webhook at `POST /api/billing/webhook` (subscription events). For
local dev, add these to `.dev.vars` instead. Pricing/tiers live in
[`shared/tiers.ts`](shared/tiers.ts).

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
npx wrangler secret put DATABASE_URL   # production DB secret (once)
npm run deploy                          # build + wrangler deploy
```

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
  auth.ts               JWKS verify + requireAuth middleware
  db.ts                 per-request Prisma client + getOrCreateUser
  routes/               me, users, media, lists, lookup
  services/scrape.ts    Open Library (books) + TMDB stub
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
  reads `DATABASE_URL` from a Wrangler secret.
- **Neon Auth JWKS path** is assumed to be `<NEON_AUTH_URL>/jwt`
  ([`worker/auth.ts`](worker/auth.ts)); confirm in the Neon Console.
- **Ratings** are half-star decimals (0.5–5).
- **Scrape-assist:** books work today (Open Library, keyless); movies/TV need a
  `TMDB_API_KEY` secret and implementing `searchScreen()`.
