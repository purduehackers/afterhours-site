# The Afterhours Foundation

A minimal website for The Afterhours Foundation, Inc., backing hacker activity and helping curious
people make things with software, hardware, and art. Live at [the.afterhours.foundation](https://the.afterhours.foundation/).

```sh
bun install
bun run dev
```

Open <http://127.0.0.1:3000>. Pages live in `public/` and share `site.css`. The homepage has no
JavaScript. `client/contribute.ts` builds to the ignored `public/contribute.js` browser bundle.
Shared validation, integer-cent fee calculations, and Checkout parameters live in `lib/`.

## Contributions

`/contribute.html` collects name, email, an optional note, USD amount, goods declaration, and optional
processing support before opening Stripe-hosted Checkout. The server validates all input and
recomputes amounts. Idempotency keys reuse a session on retries. Donor details travel in the POST
body and are saved to Checkout Session and PaymentIntent metadata.

Processing support is a voluntary estimate using Stripe's [standard US card rate](https://stripe.com/pricing)
of 2.9% + $0.30. Actual fees vary by method and account pricing. Both the browser and server use
`lib/contribution-amounts.ts`; no HCB sponsorship fee is added.

Use sandbox credentials for Development and Preview. The Vercel Stripe integration supplies
`STRIPE_SECRET_KEY`; an optional `STRIPE_RESTRICTED_KEY` takes priority. Restricted keys need
Checkout Sessions Write access. Keep local secrets in `.env.local` and deployed secrets in Vercel
Secret environment variables. Never commit credentials or expose them through `NEXT_PUBLIC_*`.

The return page confirms payment status on the server. `/api/stripe-webhook` verifies signatures
for Checkout completion, delayed success/failure, refunds, and disputes. Replays are safe because
there is no fulfillment or other business side effect. Stripe is the system of record. Add durable
event deduplication and an outbox before introducing automated email or equipment delivery.

For local webhook testing, supply the sandbox key through `STRIPE_API_KEY` and run:

```sh
stripe listen --forward-to http://127.0.0.1:3000/api/stripe-webhook
```

Save the listener's signing secret as `STRIPE_WEBHOOK_SECRET` in `.env.local`, then restart dev.
Production requires the existing Afterhours live account and a live signing secret. Register
`https://the.afterhours.foundation/api/stripe-webhook` for `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`charge.refunded`, and `charge.dispute.created`. Enable delivery after deploying the handler.
Confirm receipt, support, privacy, and refund settings before launch. The form makes no claim of tax
deductibility. The contribution page is not linked from the homepage; `phack.rs/donate` is unchanged.

## Checks and deployment

```sh
bun run typecheck
bun run lint
bun test
bun run build
vercel link --project afterhours-foundation --scope purdue-hackers
vercel --prod --scope purdue-hackers
```

Vercel serves `public/` and `api/`. The apex and `www` domains redirect to `the.afterhours.foundation`.
Organization details come from Indiana incorporation and IRS EIN records; the board listing was
supplied by the foundation. Source documents are not published. Keep claims about affiliations and
other organizations' programs grounded in documented arrangements.
