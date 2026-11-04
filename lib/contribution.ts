import { createHash } from "node:crypto";

import { Result } from "better-result";
import Stripe from "stripe";
import type { z } from "zod";

import { quoteContribution } from "../public/contribution-amounts.js";
import type { contributionSchema } from "./contribution.schema.ts";

/** Use configured deployment origins rather than a client-supplied redirect URL. */
export function contributionOrigin() {
  const configured =
    process.env.APP_ORIGIN ||
    (process.env.VERCEL_ENV === "production"
      ? "https://the.afterhours.foundation"
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://127.0.0.1:3000");
  return Result.try(() => new URL(configured).origin);
}

/** Keep the managed server key and any manually scoped replacement on the server. */
export function contributionClient() {
  const key = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY;
  return Result.try(() => new Stripe(key || "", { maxNetworkRetries: 2 }));
}

/** Recompute every monetary value and retain donor details on both Stripe records. */
export function contributionCheckout(data: z.output<typeof contributionSchema>, origin: string) {
  const quote = quoteContribution(
    Math.round(Number(data.amount) * 100),
    data.coverProcessing === "yes",
  );
  const metadata = {
    integration: "afterhours_contributions",
    donor_name: data.name,
    message: data.message,
    receiving_goods: data.goods === "yes" ? "yes" : "no",
    contribution_cents: String(quote.amountCents),
    processing_support_cents: String(quote.supportCents),
  };
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: "usd",
        product_data: { name: "Contribution to The Afterhours Foundation" },
        unit_amount: quote.amountCents,
      },
      quantity: 1,
    },
  ];
  if (quote.supportCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Optional contribution toward processing costs" },
        unit_amount: quote.supportCents,
      },
      quantity: 1,
    });
  }
  const parameters: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    integration_identifier: "afterhours_contributions_mzqvtxka",
    submit_type: "donate",
    customer_email: data.email,
    line_items: lineItems,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${origin}/contribute.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/contribute.html?canceled=1`,
  };
  const digest = createHash("sha256").update(JSON.stringify(parameters)).digest("hex");
  return {
    parameters,
    totalCents: quote.totalCents,
    idempotencyKey: `contribution:${data.attempt}:${digest}`,
  };
}
