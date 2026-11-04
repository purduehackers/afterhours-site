import { Result } from "better-result";

import { contributionSchema } from "../lib/contribution.schema.ts";
import {
  contributionCheckout,
  contributionClient,
  contributionOrigin,
} from "../lib/contribution.ts";

export default {
  /** Create hosted checkout after validating the first-step form, or report configuration readiness. */
  async fetch(request: Request) {
    const originResult = contributionOrigin(request.headers.get("origin"));
    if (originResult.isErr()) return new Response("Unavailable", { status: 503 });
    const origin = originResult.value;
    const stripe = contributionClient();
    const key = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY || "";
    const production = process.env.VERCEL_ENV === "production";
    const ready =
      stripe.isOk() &&
      (production
        ? key.includes("_live_") && Boolean(process.env.STRIPE_WEBHOOK_SECRET)
        : key.includes("_test_"));
    const headers = { "Cache-Control": "no-store" };
    if (request.method === "GET") {
      return Response.json({ ready, sandbox: key.includes("_test_") }, { headers });
    }
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { ...headers, Allow: "GET, POST" } });
    if (request.headers.get("origin") !== origin)
      return new Response("Origin not allowed", { status: 403, headers });
    if (stripe.isErr() || !ready)
      return Response.redirect(`${origin}/contribute.html?error=unavailable`, 303);
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
      return new Response("Unsupported content type", { status: 415, headers });
    }
    const body = await Result.tryPromise(() => request.text());
    if (body.isErr() || body.value.length > 8192)
      return new Response("Invalid request", { status: 400, headers });
    const parsed = contributionSchema.safeParse(
      Object.fromEntries(new URLSearchParams(body.value)),
    );
    if (!parsed.success) return Response.redirect(`${origin}/contribute.html?error=invalid`, 303);
    const checkout = contributionCheckout(parsed.data, origin);
    if (checkout.totalCents > 99999999)
      return Response.redirect(`${origin}/contribute.html?error=amount`, 303);
    const session = await Result.tryPromise(() =>
      stripe.value.checkout.sessions.create(checkout.parameters, {
        idempotencyKey: checkout.idempotencyKey,
      }),
    );
    if (session.isErr() || !session.value.url) {
      console.error("Contribution checkout creation failed");
      return Response.redirect(`${origin}/contribute.html?error=checkout`, 303);
    }
    return Response.redirect(session.value.url, 303);
  },
};
