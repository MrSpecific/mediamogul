# MediaMogul — iOS & Android (Capacitor)

This document is the plan and reference for shipping MediaMogul to the App Store
and Play Store. It reflects what's already scaffolded in the repo and what's left
to do.

## Why Capacitor (not React Native)

MediaMogul is a complete, polished Vite + React SPA built on the `@wlcr/base-ic`
web design system. Capacitor wraps that **existing** SPA as native apps — we ship
the same UI to web, iOS, and Android from one codebase. React Native would mean
rebuilding 100% of the UI (base-ic doesn't render in RN) for no near-term
benefit, which is the opposite of "simpler."

The stack is unusually mobile-friendly already:

- The entire API is under `/api/*` (`worker/index.ts`).
- Auth is a **pure bearer JWT, no cookies** (`worker/auth.ts`, `src/lib/api.ts`) —
  a native app just needs the Neon Auth token and hits the same surface.

The one genuinely new piece of work is the **OAuth (Google) sign-in flow inside a
native webview** (deep links / custom URL scheme). Prototype that first.

---

## Architecture: how the native app reaches the backend

The native webview serves the **web assets locally** (from `dist/client`, copied
into each native project). It does **not** run the Worker. So relative `/api`
paths would resolve to `capacitor://localhost` and never reach the backend.

The fix is already in place: `src/lib/api.ts` prefixes every request with
`API_BASE = import.meta.env.VITE_API_BASE_URL ?? ""`.

- **Web build:** `VITE_API_BASE_URL` unset → `API_BASE=""` → same-origin `/api/*`
  (unchanged behavior).
- **Mobile build:** set `VITE_API_BASE_URL` to the deployed Worker origin, e.g.
  `https://mediamogul.example.com`, so the app targets it explicitly.

CORS: because mobile requests are now cross-origin (`https://localhost` →
`https://mediamogul.example.com`), the Worker must send permissive CORS headers
for the app origin(s). See Phase 1.

---

## What's already scaffolded (this session)

- `@capacitor/core`, `/cli`, `/ios`, `/android`, plus `/app`, `/preferences`,
  `/browser` plugins installed.
- `capacitor.config.ts` — `appId: io.wlcr.mediamogul`, `appName: MediaMogul`,
  `webDir: dist/client`, https schemes.
- Native projects generated: `ios/` (Swift Package Manager) and `android/`. Both
  carry their own `.gitignore` (build artifacts + the copied web bundle are
  excluded; the project source is committed).
- `src/lib/api.ts` made origin-configurable via `VITE_API_BASE_URL`.
- npm scripts:
  - `npm run build:mobile` — typecheck + `vite build` (no Worker deploy).
  - `npm run cap:sync` — copy web assets + update native projects.
  - `npm run mobile:sync` — build:mobile then sync (the everyday command).
  - `npm run cap:ios` / `npm run cap:android` — open the native IDE.

### First run

```bash
# Build the web bundle pointed at the deployed API, then sync into native.
VITE_API_BASE_URL=https://mediamogul.example.com npm run build:mobile
npm run cap:sync

# Open and run from the native IDE (simulator/emulator or device).
npm run cap:ios       # Xcode      (needs a Mac + Xcode)
npm run cap:android   # Android Studio (install the Android SDK first)
```

> Android build tooling (Android Studio + SDK) is not yet installed on this
> machine — `cap add android` only generates the project; building it needs the
> SDK.

---

## Phased plan

### Phase 0 — Scaffold ✅ (done)

Platforms generated, config in place, API origin made configurable, build/sync
scripts added.

### Phase 1 — Auth + networking (the critical path)

1. **API origin + CORS.** Deploy the Worker, pick the mobile `VITE_API_BASE_URL`,
   and add CORS handling in `worker/index.ts` that allows the app origins
   (`capacitor://localhost`, `https://localhost`, `http://localhost`) with
   `Authorization` on allowed headers. (Auth is bearer-token, so no
   `credentials`/cookies needed.)
2. **Google OAuth in the webview.** Neon Auth's hosted OAuth redirect must return
   to the app. Use `@capacitor/browser` to open the auth URL in an in-app browser
   / ASWebAuthenticationSession, register a **custom URL scheme / App Link /
   Universal Link** (e.g. `mediamogul://auth-callback`), and handle the redirect
   via `@capacitor/app`'s `appUrlOpen` listener to complete the session. Confirm
   Neon Auth allows the native redirect URI.
3. **Token storage.** Browser storage in a webview is workable, but move the Neon
   Auth JWT/refresh into `@capacitor/preferences` (or Keychain/Keystore via a
   secure-storage plugin) so sessions survive app restarts cleanly.
4. **Email/password sign-in** should already work in-webview — verify end to end.

**Exit criteria:** sign up, sign in (email + Google), and sign out all work on a
device, and authenticated `/api/*` calls succeed against the remote Worker.

### Phase 2 — Native shell polish

- **Safe-area insets:** ensure the SPA respects `env(safe-area-inset-*)` (notch,
  home indicator, status bar). `capacitor.config.ts` uses iOS `contentInset:
  "always"`; audit sticky headers/toolbars.
- **App icons + splash screen:** generate with `@capacitor/assets` from a source
  logo (reuse the brand mark in `public/`).
- **Status bar** styling (`@capacitor/status-bar`) to match theme (light/dark).
- **Back button** (Android): map hardware back to router history via
  `@capacitor/app`.
- **External links:** open `http(s)` links that leave the app in the system
  browser, not the webview.

### Phase 3 — Native capabilities (incremental)

- **Push notifications** (`@capacitor/push-notifications` + APNs/FCM) — wire to
  the existing `Notification` model / notifications routes.
- **Share sheet** (`@capacitor/share`) for the "Track this on mediamogul" /
  share-media flows (pairs with the `/m/:id` OG links).
- **Haptics**, **app-review prompt**, **deep links** into `/media/:id` and
  `/u/:username` from shared URLs (Universal Links / App Links).

### Phase 4 — Store submission

- **iOS:** bundle id `io.wlcr.mediamogul`, signing in Xcode, App Store Connect
  listing, privacy nutrition labels (data collected: account + usage), TestFlight,
  review. Note Apple's guideline 4.2 — a pure web wrapper risks rejection, so lead
  with native capabilities (push, share, deep links) from Phase 3.
- **Android:** signed AAB, Play Console listing, data-safety form, internal
  testing track → production.
- **Versioning:** keep native `version`/`build` in step with app releases;
  automate `cap sync` in CI after the web build.

---

## Everyday workflow

```bash
# After any web change you want on device:
npm run mobile:sync          # build:mobile + cap sync
npm run cap:ios              # or cap:android, then Run in the IDE

# Live reload against the dev server (optional, faster iteration):
# set server.url in capacitor.config.ts to your LAN dev URL, then cap sync.
```

---

## Stack-specific gotchas

- **Don't bundle the Worker.** Only `dist/client` ships in the app; the API is
  always remote (`VITE_API_BASE_URL`).
- **CORS is now real.** Cross-origin from `https://localhost` — the Worker must
  allow it. This is the most common "works on web, fails in app" cause.
- **JWKS reachability.** The Worker verifies the Neon Auth JWT against
  `<NEON_AUTH_URL>/.well-known/jwks.json` (`worker/auth.ts`) — unchanged, but make
  sure the mobile auth flow yields the same JWT shape the Worker already accepts
  (EdDSA/Ed25519).
- **R2 uploads.** `apiUpload` posts raw file bodies to `/api/media/assets`; native
  file pickers return blobs/paths — verify the upload path with a Capacitor file
  input in Phase 3 if in-app uploads are wanted.
- **base-ic assumes a browser.** It renders in the webview fine; just watch for
  any `window`/viewport assumptions around safe areas and virtual keyboards.
