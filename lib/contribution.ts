import { createHash } from "node:crypto";

import { Result } from "better-result";
import Stripe from "stripe";
import type { z } from "zod";

import { quoteContribution } from "./contribution-amounts.ts";
import type { contributionSchema } from "./contribution.schema.ts";

/** Use configured deployment origins rather than a client-supplied redirect URL. */
export function contributionOrigin(requestOrigin?: string | null) {
  let configured = process.env.APP_ORIGIN;
  if (!configured && process.env.VERCEL_ENV === "production")
    configured = "https://the.afterhours.foundation";
  if (!configured && process.env.VERCEL_URL) configured = `https://${process.env.VERCEL_URL}`;
  return Result.try(() => {
    const origin = new URL(configured || "http://127.0.0.1:3000").origin;
    const branchOrigin = process.env.VERCEL_BRANCH_URL
      ? new URL(`https://${process.env.VERCEL_BRANCH_URL}`).origin
      : origin;
    return requestOrigin === branchOrigin ? branchOrigin : origin;
  });
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
  const parameters: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    integration_identifier: "afterhours_contributions_mzqvtxka",
    submit_type: "donate",
    customer_email: data.email,
    line_items: [
      { name: "Contribution to The Afterhours Foundation", amount: quote.amountCents },
      { name: "Optional contribution toward processing costs", amount: quote.supportCents },
    ]
      .filter(({ amount }) => amount > 0)
      .map(({ name, amount }) => ({
        price_data: { currency: "usd", product_data: { name }, unit_amount: amount },
        quantity: 1,
      })),
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
