import { Result } from "better-result";

import { contributionClient } from "../lib/contribution.ts";

export default {
  /** Show payment status without exposing donor details or triggering fulfillment. */
  async fetch(request: Request) {
    const headers = { "Cache-Control": "no-store" };
    if (request.method !== "GET")
      return new Response(null, { status: 405, headers: { ...headers, Allow: "GET" } });
    const url = Result.try(() => new URL(request.url));
    if (url.isErr()) return new Response("Invalid URL", { status: 400, headers });
    const id = url.value.searchParams.get("session_id") || "";
    if (!/^cs_(?:test|live)_[a-zA-Z0-9]{10,240}$/.test(id))
      return new Response("Invalid session", { status: 400, headers });
    const stripe = contributionClient();
    if (stripe.isErr()) return new Response("Unavailable", { status: 503, headers });
    const result = await Result.tryPromise(() => stripe.value.checkout.sessions.retrieve(id));
    if (result.isErr()) {
      console.error("Contribution status lookup failed");
      return new Response("Unable to retrieve payment", { status: 502, headers });
    }
    const session = result.value;
    if (
      session.mode !== "payment" ||
      session.metadata?.integration !== "afterhours_contributions"
    ) {
      return new Response("Unknown contribution", { status: 404, headers });
    }
    return Response.json(
      {
        paymentStatus: session.payment_status,
        status: session.status,
        amountCents: session.amount_total,
        currency: session.currency,
      },
      { headers },
    );
  },
};
