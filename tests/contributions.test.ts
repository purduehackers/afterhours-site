import { describe, expect, test } from "bun:test";

import { Result } from "better-result";
import Stripe from "stripe";

import contributions from "../api/contributions.ts";
import webhook from "../api/stripe-webhook.ts";
import { contributionSchema } from "../lib/contribution.schema.ts";
import { contributionCheckout } from "../lib/contribution.ts";

const donor = {
  name: "Test Donor",
  email: "test@example.com",
  message: "For creative learning",
  amount: "30.00",
  attempt: "f1f047c3-1d4f-419a-b3fd-7e619b68058c",
  website: "",
};

describe("contribution amount and identity boundaries", () => {
  test("rejects tampered totals, sub-dollar amounts, exponent notation and oversized messages", () => {
    for (const changed of [
      { totalCents: 1 },
      { amount: "0.99" },
      { amount: "1e3" },
      { amount: "1.001" },
      { amount: "1000000" },
      { message: "x".repeat(501) },
      { website: "spam" },
    ]) {
      expect(contributionSchema.safeParse({ ...donor, ...changed }).success).toBe(false);
    }
  });

  test("records a one-time gift without adding processing support by default", () => {
    const checkout = contributionCheckout(contributionSchema.parse(donor), "https://example.com");
    expect(checkout.totalCents).toBe(3000);
    expect(checkout.parameters.mode).toBe("payment");
    expect(checkout.parameters.line_items).toHaveLength(1);
    expect(checkout.parameters.metadata).toMatchObject({
      donor_name: "Test Donor",
      contribution_cents: "3000",
      processing_support_cents: "0",
      receiving_goods: "no",
    });
    expect(checkout.parameters.success_url).toBe(
      "https://example.com/contribute.html?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(checkout.parameters).not.toHaveProperty("payment_method_types");
    expect(checkout.parameters).not.toHaveProperty("subscription_data");
  });

  test("calculates an opt-in gross-up in integer cents and keeps the extra amount separate", () => {
    const checkout = contributionCheckout(
      contributionSchema.parse({ ...donor, coverProcessing: "yes", goods: "yes" }),
      "https://example.com",
    );
    expect(checkout.totalCents).toBe(3121);
    expect(checkout.parameters.line_items).toHaveLength(2);
    expect(checkout.parameters.metadata).toMatchObject({
      contribution_cents: "3000",
      processing_support_cents: "121",
      receiving_goods: "yes",
    });
    expect(checkout.parameters.payment_intent_data?.metadata).toEqual(checkout.parameters.metadata);
  });

  test("retries reuse a checkout, but edited data or a new attempt get a distinct key", () => {
    const parsed = contributionSchema.parse(donor);
    const first = contributionCheckout(parsed, "https://example.com");
    expect(contributionCheckout(parsed, "https://example.com").idempotencyKey).toBe(
      first.idempotencyKey,
    );
    expect(
      contributionCheckout({ ...parsed, amount: "50" }, "https://example.com").idempotencyKey,
    ).not.toBe(first.idempotencyKey);
    expect(
      contributionCheckout(
        { ...parsed, attempt: "0fa7f78e-782f-49c9-96d9-3cfccf565464" },
        "https://example.com",
      ).idempotencyKey,
    ).not.toBe(first.idempotencyKey);
  });

  test("rejects cross-origin writes before contacting Stripe", async () => {
    const response = await Result.tryPromise(() =>
      contributions.fetch(
        new Request("http://127.0.0.1:3000/api/contributions", {
          method: "POST",
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    );
    expect(response.isOk()).toBe(true);
    if (response.isOk()) expect(response.value.status).toBe(403);
  });
});

test("production stays disabled with sandbox credentials or a missing webhook signing secret", async () => {
  const previousEnvironment = process.env.VERCEL_ENV;
  const previousWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.VERCEL_ENV = "production";
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const response = await Result.tryPromise(() =>
    contributions.fetch(new Request("https://the.afterhours.foundation/api/contributions")),
  );
  expect(response.isOk()).toBe(true);
  if (response.isOk()) {
    const body = await Result.tryPromise(() => response.value.json());
    expect(body.isOk()).toBe(true);
    if (body.isOk()) expect(body.value.ready).toBe(false);
  }
  if (previousEnvironment) process.env.VERCEL_ENV = previousEnvironment;
  else delete process.env.VERCEL_ENV;
  if (previousWebhook) process.env.STRIPE_WEBHOOK_SECRET = previousWebhook;
});

describe("webhook authentication and replay", () => {
  test("rejects forged events and safely acknowledges repeated authentic paid events", async () => {
    const previous = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = "test-only-webhook-signing-secret";
    const stripe = new Stripe("test-only-webhook-verifier");
    const payload = JSON.stringify({
      id: "evt_test_contribution",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_contribution",
          payment_status: "paid",
          metadata: { integration: "afterhours_contributions" },
        },
      },
    });
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    const forged = await Result.tryPromise(() =>
      webhook.fetch(
        new Request("https://example.com/api/stripe-webhook", {
          method: "POST",
          headers: { "stripe-signature": "forged" },
          body: payload,
        }),
      ),
    );
    expect(forged.isOk()).toBe(true);
    if (forged.isOk()) expect(forged.value.status).toBe(400);
    for (let count = 0; count < 2; count++) {
      const response = await Result.tryPromise(() =>
        webhook.fetch(
          new Request("https://example.com/api/stripe-webhook", {
            method: "POST",
            headers: { "stripe-signature": signature },
            body: payload,
          }),
        ),
      );
      expect(response.isOk()).toBe(true);
      if (response.isOk()) expect(response.value.status).toBe(200);
    }
    if (previous) process.env.STRIPE_WEBHOOK_SECRET = previous;
    else delete process.env.STRIPE_WEBHOOK_SECRET;
  });
});
