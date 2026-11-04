import { afterEach, describe, expect, test } from "bun:test";

import { Result } from "better-result";
import Stripe from "stripe";

import contributions from "../api/contributions.ts";
import webhook from "../api/stripe-webhook.ts";
import { contributionSchema } from "../lib/contribution.schema.ts";
import { contributionCheckout } from "../lib/contribution.ts";

/** Fail rejected handlers directly so tests can assert the HTTP response. */
async function request(handler: typeof contributions, url: string, init?: RequestInit) {
  const response = await Result.tryPromise(() => handler.fetch(new Request(url, init)));
  if (response.isErr()) expect.unreachable(response.error.message);
  return response.value;
}

const environment = {
  APP_ORIGIN: process.env.APP_ORIGIN,
  VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  STRIPE_RESTRICTED_KEY: process.env.STRIPE_RESTRICTED_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
};
afterEach(() => {
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

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
    expect(checkout.parameters.line_items).toMatchObject([
      { price_data: { unit_amount: 3000 }, quantity: 1 },
      { price_data: { unit_amount: 121 }, quantity: 1 },
    ]);
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
});

describe("request origin boundaries", () => {
  test("rejects cross-origin writes before contacting Stripe", async () => {
    const response = await request(contributions, "http://127.0.0.1:3000/api/contributions", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    });
    expect(response.status).toBe(403);
  });

  test("accepts the server-configured Vercel branch alias and keeps redirects on that origin", async () => {
    process.env.APP_ORIGIN = "https://canonical-preview.vercel.app";
    process.env.VERCEL_BRANCH_URL = "branch-preview.vercel.app";
    const response = await request(
      contributions,
      "https://branch-preview.vercel.app/api/contributions",
      {
        method: "POST",
        headers: {
          Origin: "https://branch-preview.vercel.app",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "",
      },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toStartWith(
      "https://branch-preview.vercel.app/contribute.html?",
    );
  });
});

test("production stays disabled with sandbox credentials or a missing webhook signing secret", async () => {
  process.env.VERCEL_ENV = "production";
  for (const { key, secret } of [
    { key: "rk_test_unit", secret: "test-only-signing-secret" },
    { key: "rk_live_unit", secret: "" },
  ]) {
    process.env.STRIPE_RESTRICTED_KEY = key;
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    const response = await request(
      contributions,
      "https://the.afterhours.foundation/api/contributions",
    );
    const body = await Result.tryPromise(() => response.json());
    expect(body.isOk()).toBe(true);
    if (body.isOk()) expect(body.value.ready).toBe(false);
  }
});

test("webhook rejects forged events and safely acknowledges repeated authentic paid events", async () => {
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
  for (const header of ["forged", signature, signature]) {
    const response = await request(webhook, "https://example.com/api/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": header },
      body: payload,
    });
    expect(response.status).toBe(header === "forged" ? 400 : 200);
  }
});
