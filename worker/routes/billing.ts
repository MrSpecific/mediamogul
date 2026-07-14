import { Hono } from "hono";
import type { Context } from "hono";
import Stripe from "stripe";
import { getPrisma } from "../db";
import { TIERS, formatPrice } from "../../shared/tiers";
import type { TierId } from "../../shared/tiers";
import type { PrismaClient } from "../generated/prisma/client";
import type { AppEnv } from "../types";

function stripe(env: Env): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  // Fetch-based HTTP + WebCrypto make the Stripe SDK Workers-compatible.
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

// Webhook signature verification must use WebCrypto on Workers (the default
// path uses Node's synchronous crypto, which isn't available at the edge).
const cryptoProvider = Stripe.createSubtleCryptoProvider();

/** A live subscription (paying or in trial) unlocks Standard; anything else is Free. */
function tierForStatus(status: Stripe.Subscription.Status | undefined): TierId {
  return status === "active" || status === "trialing" ? "STANDARD" : "FREE";
}

type ProfileRow = { id: string; tier: TierId; stripeCustomerId: string | null };

interface ReconcileResult {
  tier: TierId;
  changed: boolean;
  customerId: string | null;
  subscriptionId: string | null;
}

/**
 * Reconcile a user's tier against Stripe, the source of truth. Used by the
 * repair endpoint (`POST /sync`) and as a self-heal when the async webhook is
 * delayed or was never delivered. Safe and idempotent: it only ever grants what
 * Stripe actually reports, so a user can't upgrade themselves for free by
 * calling it.
 */
async function reconcileTier(
  s: Stripe,
  prisma: PrismaClient,
  profile: ProfileRow,
  email: string | undefined,
): Promise<ReconcileResult> {
  // Resolve a customer id. Prefer the stored one, but verify it still exists
  // under the current key/mode; otherwise fall back to matching by email so we
  // can recover even if the id was never persisted.
  let customerId = profile.stripeCustomerId;
  if (customerId) {
    const existing = await s.customers.retrieve(customerId).catch(() => null);
    if (!existing || existing.deleted) customerId = null;
  }
  if (!customerId && email) {
    const found = await s.customers.list({ email, limit: 10 });
    const match =
      found.data.find((cust) => cust.metadata?.userId === profile.id) ??
      found.data[0];
    if (match) customerId = match.id;
  }

  // No customer at all → the user never completed checkout. Ensure Free.
  if (!customerId) {
    const changed = profile.tier !== "FREE";
    if (changed) {
      await prisma.user.update({
        where: { id: profile.id },
        data: { tier: "FREE" },
      });
    }
    return { tier: "FREE", changed, customerId: null, subscriptionId: null };
  }

  // Choose the subscription that decides the tier: an active/trialing one if it
  // exists, else the most recently created (so we still record its id).
  const subs = await s.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const live = subs.data.find(
    (sub) => sub.status === "active" || sub.status === "trialing",
  );
  const chosen = live ?? subs.data[0] ?? null;
  const tier = tierForStatus(live?.status);

  const changed =
    profile.tier !== tier || profile.stripeCustomerId !== customerId;
  await prisma.user.update({
    where: { id: profile.id },
    data: {
      tier,
      stripeCustomerId: customerId,
      stripeSubscriptionId: chosen?.id ?? null,
    },
  });

  return { tier, changed, customerId, subscriptionId: chosen?.id ?? null };
}

export const billing = new Hono<AppEnv>();

/** Plans + current tier, for the pricing/settings UI. */
billing.get("/plans", (c) =>
  c.json({
    currentTier: c.get("profile").tier,
    plans: Object.values(TIERS).map((t) => ({
      id: t.id,
      name: t.name,
      price: formatPrice(t.priceCents),
      priceCents: t.priceCents,
      description: t.description,
      features: t.features,
    })),
  }),
);

/** Start a Stripe Checkout session to subscribe to Standard. */
billing.post("/checkout", async (c) => {
  // Both the secret key and the price id must be configured. Report a clean
  // 501 (not a generic 500) if either is missing in this environment.
  if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_PRICE_STANDARD) {
    return c.json({ error: "billing_not_configured" }, 501);
  }
  const prisma = c.get("prisma");
  const profile = c.get("profile");
  const s = stripe(c.env);

  // Optional discount code entered when choosing the plan.
  const body = (await c.req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.trim() : "";

  try {
    // If a code was entered, resolve it to an active Stripe promotion code so
    // it can be applied; otherwise let Stripe collect one on its own page.
    let discountId: string | null = null;
    if (code) {
      const promos = await s.promotionCodes.list({
        code,
        active: true,
        limit: 1,
      });
      if (!promos.data[0]) {
        return c.json(
          {
            error: "invalid_code",
            message: "That discount code isn't valid or has expired.",
          },
          400,
        );
      }
      discountId = promos.data[0].id;
    }

    // Resolve a usable customer. A stored id from a different Stripe mode or
    // account (e.g. after switching test→live keys) no longer exists under the
    // current key, so verify it and recreate if it's missing/deleted.
    let customerId = profile.stripeCustomerId;
    if (customerId) {
      const existing = await s.customers
        .retrieve(customerId)
        .catch(() => null);
      if (!existing || existing.deleted) customerId = null;
    }
    if (!customerId) {
      const customer = await s.customers.create({
        email: c.get("user").email,
        metadata: { userId: profile.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: profile.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const origin = new URL(c.req.url).origin;
    const session = await s.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: profile.id,
      line_items: [{ price: c.env.STRIPE_PRICE_STANDARD, quantity: 1 }],
      subscription_data: { metadata: { userId: profile.id } },
      // `discounts` and `allow_promotion_codes` are mutually exclusive: apply
      // the entered code if we resolved one, else let Stripe collect one.
      ...(discountId
        ? { discounts: [{ promotion_code: discountId }] }
        : { allow_promotion_codes: true }),
      success_url: `${origin}/settings?upgraded=1`,
      cancel_url: `${origin}/settings`,
    });
    return c.json({ url: session.url });
  } catch (err) {
    // Surface the underlying Stripe reason (e.g. bad/mismatched price id or
    // key) instead of a generic internal_error, and log it for `wrangler tail`.
    console.error("stripe checkout failed:", err);
    return c.json(
      { error: "checkout_failed", message: (err as Error).message },
      502,
    );
  }
});

/** Stripe customer portal link (manage/cancel subscription). */
billing.post("/portal", async (c) => {
  const profile = c.get("profile");
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "billing_not_configured" }, 501);
  }
  if (!profile.stripeCustomerId) return c.json({ error: "no_customer" }, 400);
  const origin = new URL(c.req.url).origin;
  const s = stripe(c.env);
  try {
    const portal = await s.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${origin}/settings`,
    });
    return c.json({ url: portal.url });
  } catch (err) {
    console.error("stripe portal failed:", err);
    return c.json(
      { error: "portal_failed", message: (err as Error).message },
      502,
    );
  }
});

/**
 * Repair path: reconcile the caller's tier against Stripe on demand. Fixes the
 * "paid but still on Free" case when the webhook was missed (bad signing
 * secret, endpoint not registered, transient delivery failure). Idempotent —
 * always reflects what Stripe reports.
 */
billing.post("/sync", async (c) => {
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "billing_not_configured" }, 501);
  }
  const prisma = c.get("prisma");
  const profile = c.get("profile") as ProfileRow;
  const email = c.get("user").email;
  const s = stripe(c.env);
  try {
    const result = await reconcileTier(s, prisma, profile, email);
    return c.json({ tier: result.tier, changed: result.changed });
  } catch (err) {
    console.error("stripe sync failed:", err);
    return c.json({ error: "sync_failed", message: (err as Error).message }, 502);
  }
});

/**
 * Stripe webhook — keeps `User.tier` in sync with subscription status.
 * Mounted OUTSIDE the auth-protected group (Stripe calls it unauthenticated;
 * the signature is the auth). Uses the raw request body + async signature
 * verification (WebCrypto).
 */
export async function handleStripeWebhook(
  c: Context<AppEnv>,
): Promise<Response> {
  if (!c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: "billing_not_configured" }, 501);
  }
  const s = stripe(c.env);
  const signature = c.req.header("stripe-signature");
  const body = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await s.webhooks.constructEventAsync(
      body,
      signature ?? "",
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch {
    return c.json({ error: "invalid_signature" }, 400);
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const tier = tierForStatus(sub.status);
    const prisma = getPrisma(c.env);
    const { count } = await prisma.user.updateMany({
      where: { stripeCustomerId: sub.customer as string },
      data: { tier, stripeSubscriptionId: sub.id },
    });

    // No row matched the customer id (e.g. it was never persisted). Fall back to
    // the userId we stamp on the subscription at checkout, and backfill the
    // customer id so future webhooks match directly.
    if (count === 0) {
      const userId = sub.metadata?.userId;
      if (userId) {
        await prisma.user.updateMany({
          where: { id: userId },
          data: {
            tier,
            stripeCustomerId: sub.customer as string,
            stripeSubscriptionId: sub.id,
          },
        });
      }
    }
  }

  return c.json({ received: true });
}
