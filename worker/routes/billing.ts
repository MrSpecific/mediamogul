import { Hono } from "hono";
import type { Context } from "hono";
import Stripe from "stripe";
import { getPrisma } from "../db";
import { TIERS, formatPrice } from "../../shared/tiers";
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
  if (!c.env.STRIPE_PRICE_STANDARD) {
    return c.json({ error: "billing_not_configured" }, 501);
  }
  const prisma = c.get("prisma");
  const profile = c.get("profile");
  const s = stripe(c.env);

  let customerId = profile.stripeCustomerId;
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
    success_url: `${origin}/settings?upgraded=1`,
    cancel_url: `${origin}/settings`,
  });
  return c.json({ url: session.url });
});

/** Stripe customer portal link (manage/cancel subscription). */
billing.post("/portal", async (c) => {
  const profile = c.get("profile");
  if (!profile.stripeCustomerId) return c.json({ error: "no_customer" }, 400);
  const origin = new URL(c.req.url).origin;
  const s = stripe(c.env);
  const portal = await s.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${origin}/settings`,
  });
  return c.json({ url: portal.url });
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
    const active = sub.status === "active" || sub.status === "trialing";
    const prisma = getPrisma(c.env);
    await prisma.user.updateMany({
      where: { stripeCustomerId: sub.customer as string },
      data: {
        tier: active ? "STANDARD" : "FREE",
        stripeSubscriptionId: sub.id,
      },
    });
  }

  return c.json({ received: true });
}
