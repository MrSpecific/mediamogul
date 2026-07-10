# mediamogul — Plan of Attack

A platform for tracking media consumption (movies, TV, books, magazines) with a
shared catalog, ratings, reviews, consumption history, social following, and
lists.

## Stack

- **Frontend:** React 19 + Vite SPA, routing via `react-router-dom` v7,
  UI via **`@wlcr/base-ic`** (Base UI primitives + CSS Modules/CSS variables —
  **no Tailwind, ever**).
- **Backend:** Hono on Cloudflare Workers, one Worker serving both the SPA
  (static assets) and the API under `/api/*`.
- **Database:** Neon Postgres via Prisma 7 (Rust-free query compiler + Neon
  driver adapter).
- **Auth:** Neon Auth (Better Auth). Client uses the prebuilt UI; the Worker
  verifies JWTs against the Neon Auth JWKS.

## Data model (implemented — see `prisma/schema.prisma`)

- **User** — app profile keyed by the Neon Auth user id; `username`, display
  fields. Upserted on first authenticated request.
- **MediaItem** — unified catalog row with `type` (MOVIE / TV_SHOW / BOOK /
  MAGAZINE), cover, short description, synopsis, release date, and a `metadata`
  JSON blob for type-specific fields (runtime, seasons, author, ISBN, page
  count, publisher, issue…).
- **ExternalId** — cross-references to IMDB / TMDB / Goodreads / ISBN /
  Open Library / Wikidata. Unique per `(source, value)` for dedupe.
- **MediaEntry** — one watch/read/listen. Multiple per (user, media) →
  rewatches/rereads. Status, start/finish, progress marker, note.
- **Rating** — 1–5 stars, one per (user, media).
- **Review** — one per (user, media), `PUBLIC` / `UNLISTED` / `PRIVATE`,
  spoiler flag.
- **Follow** — user → user.
- **MediaList** — owned list with visibility + `allowedTypes` (empty = any) +
  `ranked` flag.
- **MediaListItem** — membership with position/note; enforces `allowedTypes`.
- **SavedList** — a user saving/following someone else's list.

## API (implemented — see `worker/routes/`)

All routes require a Neon Auth session except `GET /api/` (health).

| Area | Endpoints |
| --- | --- |
| Profile | `GET/PATCH /api/me`, `GET /api/me/entries`, `GET /api/me/lists` |
| Users | `GET /api/users/:username`, `PUT/DELETE /api/users/:username/follow` |
| Catalog | `GET/POST /api/media`, `GET/PATCH /api/media/:id`, `POST /api/media/import` |
| Entries | `GET/POST /api/media/:id/entries`, `PATCH/DELETE /api/media/:id/entries/:entryId` |
| Rating | `PUT/DELETE /api/media/:id/rating` |
| Reviews | `GET /api/media/:id/reviews`, `PUT/DELETE /api/media/:id/review` |
| Lists | `GET/POST /api/lists`, `GET/PATCH/DELETE /api/lists/:id`, `POST /api/lists/:id/items`, `DELETE /api/lists/:id/items/:itemId`, `PUT/DELETE /api/lists/:id/save` |
| Scrape-assist | `GET /api/lookup?source=open_library&q=…` or `&isbn=…` |

## Scrape-assist strategy

- **Books:** Open Library (keyless) — search + ISBN lookup implemented.
- **Movies/TV:** TMDB — stubbed; add `TMDB_API_KEY` secret and implement
  `searchScreen()` in `worker/services/scrape.ts`.
- **Books (alt):** Goodreads has no open API; use ISBN → Open Library instead.
- Flow: `GET /api/lookup` returns unsaved `MediaCandidate[]`; the user picks one,
  optionally edits, then `POST /api/media/import` creates the catalog row
  (deduped on external ids).

## Build phases

### Phase 1 — Foundations ✅
Vite + Hono + Prisma/Neon on one Worker; Neon Auth (UI + JWT-protected API);
full schema; full CRUD API; Open Library scrape-assist.

### Phase 2 — Frontend (in progress)
- API client with bearer-token injection (`src/lib/api.ts`).
- Auth: `NeonAuthUIProvider`, `/auth/:pathname` view, `UserButton`, route guard.
- Pages: catalog browse/search, media detail (rate/review/log/add-to-list),
  "add media" (scrape-assist), profile, lists index + detail, activity feed.
- All UI from `@wlcr/base-ic` — **no Tailwind**.

### Phase 3 — Polish & social
- Aggregate stats on profiles; following feed (entries from followed users).
- List reordering (drag), ranked lists.
- Half-star ratings (schema note included).
- Optimistic updates, empty/loading/error states, pagination UI.

### Phase 4 — Shared & collaborative (future)
- `ListCollaborator` model for shared editable lists.
- Follow feed ranking, notifications.
- Richer scrape sources (TMDB, IGDB-style), background enrichment jobs
  (Workers Cron / Queues).
- Full-text search (Postgres `tsvector` or external index).

## Known follow-ups / decisions

- **Neon Auth JWKS path** assumed to be `<NEON_AUTH_URL>/jwt`
  (`worker/auth.ts`). Confirm against the Neon Console and adjust if needed.
- **Rating scale** is integer 1–5; half-stars need a `Decimal(2,1)` migration.
- **Reviews** are one-per-(user, media); if rewatch-specific reviews are wanted,
  relax the unique constraint and link a review to a `MediaEntry`.
- **Search** is `ILIKE` on title for now; move to full-text for scale.
