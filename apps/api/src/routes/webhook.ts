import { Router } from "express";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { users } from "@screenshotsmcp/db";

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}
export const webhookRouter = Router();

webhookRouter.post("/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      req.body as Buffer,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    res.status(400).send("Webhook signature verification failed");
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const sub = event.data.object as Stripe.Subscription;
    const priceId = sub.items.data[0]?.price.id;

    let plan: "free" | "starter" | "pro" = "free";
    if (priceId === process.env.STRIPE_STARTER_PRICE_ID) plan = "starter";
    if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = "pro";

    await db
      .update(users)
      .set({ plan, stripeSubscriptionId: sub.id })
      .where(eq(users.stripeCustomerId, sub.customer as string));
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await db
      .update(users)
      .set({ plan: "free", stripeSubscriptionId: null })
      .where(eq(users.stripeCustomerId, sub.customer as string));
  }

  res.json({ received: true });
});
