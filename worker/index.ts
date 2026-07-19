import { Hono } from "hono";
import { requireAuth, isAdminByEmail } from "./auth";
import { getOrCreateUser, withDb } from "./db";
import { me } from "./routes/me";
import { users } from "./routes/users";
import { media } from "./routes/media";
import { lists } from "./routes/lists";
import { lookup } from "./routes/lookup";
import { series } from "./routes/series";
import { genres } from "./routes/genres";
import { contentRatings } from "./routes/content-ratings";
import { notifications } from "./routes/notifications";
import { billing, handleStripeWebhook } from "./routes/billing";
import { submissions } from "./routes/submissions";
import { admin } from "./routes/admin";
import { handleBatchImport, handleCoverTrueUp } from "./routes/batch";
import { runScheduledDiscovery } from "./services/discovery";
import { publicRoutes, renderMediaOg } from "./routes/public";
import { proxyNeonAuth } from "./routes/auth-proxy";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

// Same-origin proxy to the Neon Auth server, so its session cookie is
// first-party (third-party cookies are blocked by Safari/Firefox/incognito,
// which broke session persistence). Public by design: the session cookie
// itself is the credential. Registered before the requireAuth group.
app.all("/api/auth/*", proxyNeonAuth);

// Public health/info endpoint. Registered before the auth middleware below, so
// it stays open.
app.get("/api/", (c) => c.json({ name: "mediamogul API", status: "ok" }));

// Stripe webhook — public (verified by signature, not by session). Registered
// before the auth group so it bypasses requireAuth.
app.post("/api/billing/webhook", handleStripeWebhook);

// Bulk import for tooling/scripts — public route, authorized by the BATCH_TOKEN
// shared secret (not a session), so it bypasses requireAuth. See routes/batch.ts.
app.post("/api/batch/import", handleBatchImport);
// Cover true-up (ingest historic remote covers into R2) — same token guard.
app.post("/api/batch/true-up-covers", handleCoverTrueUp);

// Public delivery of uploaded R2 images (referenced as coverImageUrl). Not
// under /api, so it bypasses auth; images are loaded directly by <img>.
app.get("/uploads/*", async (c) => {
  const key = decodeURIComponent(c.req.path.slice("/uploads/".length));
  if (!key) return c.notFound();
  const obj = await c.env.MEDIA_BUCKET.get(key);
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});

// Public (unauthenticated) media data.
app.route("/api/public", publicRoutes);

// Public shareable media page — Worker runs first (see wrangler.jsonc) and
// injects per-item OpenGraph tags into the SPA shell.
app.get("/m/:id", renderMediaOg);

// Everything else under /api requires a valid Neon Auth session. Middleware
// order: verify JWT -> attach Prisma -> ensure the app profile row exists (so
// FKs to User are always satisfied).
const api = new Hono<AppEnv>();
api.use("*", requireAuth);
api.use("*", withDb);
api.use("*", async (c, next) => {
  const profile = await getOrCreateUser(c.get("prisma"), c.get("user"));
  // Deactivated accounts are blocked from the API. Email-allowlisted admins are
  // exempt (lockout-safe) so the owner can always get back in to undo it.
  if (profile.deactivatedAt && !isAdminByEmail(c.get("user"), c.env)) {
    return c.json({ error: "account_deactivated" }, 403);
  }
  c.set("profile", profile);
  await next();
});

api.route("/me", me);
api.route("/users", users);
api.route("/media", media);
api.route("/lists", lists);
api.route("/lookup", lookup);
api.route("/series", series);
api.route("/genres", genres);
api.route("/content-ratings", contentRatings);
api.route("/notifications", notifications);
api.route("/billing", billing);
api.route("/submissions", submissions);
api.route("/admin", admin);

app.route("/api", api);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});

// Non-/api requests are served by Cloudflare static assets (the React SPA).
// Exported as an object so we can add the `scheduled` (cron) handler alongside
// `fetch` — see the cron trigger in wrangler.jsonc + services/discovery.ts.
export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    app.fetch(request, env, ctx),
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduledDiscovery(env));
  },
} satisfies ExportedHandler<Env>;
