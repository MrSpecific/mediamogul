# mediamogul

Full-stack app deployed as a **single Cloudflare Worker**:

| Layer | Tech | Location |
| --- | --- | --- |
| Frontend | React 19 + Vite (SPA) | [`src/`](src/) |
| Backend | [Hono](https://hono.dev) API | [`worker/index.ts`](worker/index.ts) |
| Database | [Neon](https://neon.tech) Postgres via [Prisma 7](https://www.prisma.io) | [`prisma/schema.prisma`](prisma/schema.prisma) |
| Hosting | Cloudflare Workers + static assets | [`wrangler.jsonc`](wrangler.jsonc) |

The React app and the Hono API ship in one Worker. Requests to `/api/*` hit
Hono; every other path is served from the built SPA (with client-side routing
fallback). This means a single `npm run deploy`.

## Architecture

```
Request ─┬─ /api/*  ─────────────► Hono (worker/index.ts) ─► Prisma ─► Neon
         └─ everything else ─────► React SPA (static assets, index.html)
```

- [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/)
  runs the real Worker inside Vite's dev server, so `npm run dev` gives you HMR
  for the frontend and the actual Workers runtime for the API.
- Prisma uses the Rust-free `prisma-client` generator (`runtime = "workerd"`)
  plus the Neon driver adapter, which is what lets Prisma run on Workers.

## Prerequisites

- Node 20+
- A [Neon](https://neon.tech) project (free tier is fine)
- A Cloudflare account (`npx wrangler login`)

## Setup

```bash
npm install                     # installs deps + generates the Prisma client

cp .env.example .env            # Prisma CLI connection string (migrations)
cp .dev.vars.example .dev.vars  # connection string the Worker reads in dev
```

Put your Neon **pooled** connection string (Neon dashboard → Connection Details)
into both files as `DATABASE_URL`. Then create the tables:

```bash
npm run db:push                 # push schema.prisma to Neon (or db:migrate)
```

## Develop

```bash
npm run dev                     # http://localhost:5173  — SPA + /api on one origin
```

Try it: `curl http://localhost:5173/api/` → `{"name":"mediamogul API","status":"ok"}`

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler secret put DATABASE_URL   # set the prod DB secret (once)
npm run deploy                          # build (client + worker) then wrangler deploy
```

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server with the Worker running in workerd |
| `npm run build` | Generate Prisma client + CF types, typecheck, build client + worker |
| `npm run preview` | Preview the production build in the Workers runtime |
| `npm run deploy` | Build then `wrangler deploy` |
| `npm run db:push` | Push `schema.prisma` to Neon (no migration files) |
| `npm run db:migrate` | Create + apply a dev migration |
| `npm run db:deploy` | Apply migrations in CI/production |
| `npm run db:studio` | Open Prisma Studio |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` (after editing `wrangler.jsonc`) |

## Layout

```
src/                     React SPA (frontend)
worker/
  index.ts               Hono app — API routes under /api/*
  env.d.ts               Env typing for secrets (DATABASE_URL)
  generated/prisma/      Generated Prisma client (git-ignored)
prisma/
  schema.prisma          Data model
prisma.config.ts         Prisma 7 CLI config (schema path + migrate connection)
wrangler.jsonc           Cloudflare Worker + static assets config
vite.config.ts           Vite + React + Cloudflare plugin
```

## Notes

- **Secrets:** `.env` (Prisma CLI) and `.dev.vars` (Worker in dev) are
  git-ignored. In production the Worker reads `DATABASE_URL` from a Wrangler
  secret, not from these files.
- **Prisma 7:** the connection URL lives in `prisma.config.ts`, not in the
  `datasource` block of `schema.prisma`.
- Rerun `npm run cf-typegen` whenever you change bindings in `wrangler.jsonc`.
