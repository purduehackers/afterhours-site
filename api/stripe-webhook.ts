import { Result } from "better-result";
import Stripe from "stripe";

export default {
  /** Verify asynchronous Stripe events. Stripe remains the contribution system of record. */
  async fetch(request: Request) {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return new Response("Webhook not configured", { status: 503 });
    const signature = request.headers.get("stripe-signature");
    if (!signature) return new Response("Missing signature", { status: 400 });
    const raw = await Result.tryPromise(() => request.text());
    if (raw.isErr()) return new Response("Invalid body", { status: 400 });
    const verifier = new Stripe("webhook-verifier");
    const verified = await Result.tryPromise(() =>
      verifier.webhooks.constructEventAsync(raw.value, signature, secret),
    );
    if (verified.isErr()) return new Response("Invalid signature", { status: 400 });
    const event = verified.value;
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      if (
        session.metadata?.integration === "afterhours_contributions" &&
        session.payment_status === "paid"
      ) {
        console.info("Contribution payment confirmed", {
          eventId: event.id,
          sessionId: session.id,
        });
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      console.info("Contribution payment failed", {
        eventId: event.id,
        sessionId: event.data.object.id,
      });
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      console.info("Contribution payment requires review", { eventId: event.id, type: event.type });
    }
    // Repeated deliveries are safe because this endpoint has no fulfillment or other business side effects.
    return Response.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
  },
};
