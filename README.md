# The Afterhours Foundation

A minimal website for The Afterhours Foundation, Inc., an Indiana nonprofit backing hacker
activity and helping curious people make cool things with software, hardware, and art.

Live at [the.afterhours.foundation](https://the.afterhours.foundation/).

```sh
bun install
bun run dev
```

Open <http://127.0.0.1:3000>. Edit the files in `public`.

The foundation homepage is `public/index.html`. It keeps the original plain HTML and inline CSS.
The contribution page at `/contribute.html` uses a small browser bundle and Vercel Functions.
`bun run build` bundles its TypeScript entry point. The homepage does not load JavaScript.

## Contributions

The one-time form collects the donor's name, email, optional message, USD amount, whether goods or
services are received, and optional extra support for processing costs. It then opens Stripe-hosted
Checkout. The server validates input, calculates the total in integer cents, and uses an idempotency
key so retrying the same submission reuses its Checkout Session. Donor details are sent in the POST
body and recorded in Checkout Session and PaymentIntent metadata, rather than query strings.

The optional processing amount estimates a gross-up at Stripe's published US domestic-card rate of
2.9% + $0.30, verified November 4, 2026 at [Stripe pricing](https://stripe.com/pricing). It is an
additional voluntary contribution. Actual fees vary by method and account pricing. The shared
calculation is in `public/contribution-amounts.js`. No HCB fiscal-sponsorship fee is applied.

Development and Preview use the Vercel-managed `afterhours-contributions-dev` Stripe sandbox.
The Marketplace integration supplies `STRIPE_SECRET_KEY` directly. The backend also accepts
`STRIPE_RESTRICTED_KEY` as a higher-priority alternative, with Checkout Sessions Write permission.
Keep credentials in `.env.local` for local use and Secret environment variables on Vercel. Never
put them in `public/`, source code, query strings, logs, or `NEXT_PUBLIC_*` variables.

The return page retrieves payment status from the server. It does not infer success from the URL.
The signed `/api/stripe-webhook` endpoint handles completed and delayed payments, delayed failures,
refunds, and disputes. It acknowledges repeated events safely and logs only event/session IDs.
Stripe is the contribution system of record; there is no local database or automatic fulfillment.
Add durable event deduplication and an outbox before introducing email, equipment delivery, or
other business side effects. Only paid sessions may trigger those actions.

For local webhook testing, run `stripe listen --forward-to http://127.0.0.1:3000/api/stripe-webhook`
with the sandbox API key supplied through `STRIPE_API_KEY`. Store its signing secret in
`STRIPE_WEBHOOK_SECRET` in `.env.local`, then restart the dev server. Do not print or commit either key.

Before production launch:

- Import the existing **The Afterhours Foundation, Inc.** live Stripe account into Vercel and connect
  it to this project's Production environment. Development and Preview must keep sandbox keys.
- Register `https://the.afterhours.foundation/api/stripe-webhook` in the live account for
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `charge.refunded`, and `charge.dispute.created`.
  Set its signing secret as the Production `STRIPE_WEBHOOK_SECRET`, then redeploy.
- Confirm Stripe verification, support details, payment-receipt settings, and the foundation's
  privacy and refund policies. The form does not assert federal tax-exempt status or deductibility.

The contribution page is not linked from the homepage yet. `phack.rs/donate` is managed separately
and is not changed by this repository or deployment.

```sh
bun run typecheck
bun run lint
bun test
bun run build
```

The incorporation date, business ID, president, and EIN were checked against the Indiana business
record and IRS EIN notice dated September 21, 2026. Contact information and the educational purpose
come from the INBiz incorporation review. The source PDFs are not published with the site.

The board listing was supplied by the foundation. The page does not assert federal tax-exempt
status or tax deductibility. Add those details and public annual filings when they are confirmed
and available.

Describe the foundation's own mission and activities. Claims about operating or funding another
organization's programs or formal affiliations must reflect documented arrangements. The current
copy does not establish such arrangements.

Deploy to the `afterhours-foundation` Vercel project:

```sh
vercel link --project afterhours-foundation
vercel --prod
```

Vercel serves `public` directly. The primary domain is `the.afterhours.foundation`;
`afterhours.foundation` and `www.afterhours.foundation` permanently redirect to it through the
project's domain settings.
