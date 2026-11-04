/** Estimate voluntary processing support using Stripe's published US domestic-card rate. */
export function quoteContribution(amountCents: number, coverProcessing: boolean) {
  const totalCents = coverProcessing ? Math.ceil(((amountCents + 30) * 10000) / 9710) : amountCents;
  return { amountCents, supportCents: totalCents - amountCents, totalCents };
}

/** Format integer cents for the USD contribution form. */
export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
