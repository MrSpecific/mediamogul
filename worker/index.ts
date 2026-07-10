import { Hono } from "hono";
import { requireAuth } from "./auth";
import { getOrCreateUser, withDb } from "./db";
import { me } from "./routes/me";
import { users } from "./routes/users";
import { media } from "./routes/media";
import { lists } from "./routes/lists";
import { lookup } from "./routes/lookup";
import { billing, handleStripeWebhook } from "./routes/billing";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

// Public health/info endpoint. Registered before the auth middleware below, so
// it stays open.
app.get("/api/", (c) => c.json({ name: "mediamogul API", status: "ok" }));

// Stripe webhook — public (verified by signature, not by session). Registered
// before the auth group so it bypasses requireAuth.
app.post("/api/billing/webhook", handleStripeWebhook);

// Everything else under /api requires a valid Neon Auth session. Middleware
// order: verify JWT -> attach Prisma -> ensure the app profile row exists (so
// FKs to User are always satisfied).
const api = new Hono<AppEnv>();
api.use("*", requireAuth);
api.use("*", withDb);
api.use("*", async (c, next) => {
  c.set("profile", await getOrCreateUser(c.get("prisma"), c.get("user")));
  await next();
});

api.route("/me", me);
api.route("/users", users);
api.route("/media", media);
api.route("/lists", lists);
api.route("/lookup", lookup);
api.route("/billing", billing);

app.route("/api", api);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});

// Non-/api requests are served by Cloudflare static assets (the React SPA).
export default app;
