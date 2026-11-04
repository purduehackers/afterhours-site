import { Result } from "better-result";

import { formatUsd } from "../public/contribution-amounts.js";

/** Confirm the return-page payment status on the server before showing a paid acknowledgment. */
export async function showContributionStatus(sessionId: string, form: HTMLFormElement) {
  const confirmation = document.querySelector<HTMLElement>("#confirmation");
  const title = document.querySelector<HTMLElement>("#confirmation-title");
  const message = document.querySelector<HTMLElement>("#confirmation-message");
  if (!confirmation || !title || !message) return;
  form.hidden = true;
  confirmation.hidden = false;
  confirmation.focus();
  const status = await Result.tryPromise(() =>
    fetch(`/api/contribution-status?session_id=${encodeURIComponent(sessionId)}`),
  );
  if (status.isErr() || !status.value.ok) {
    title.textContent = "We couldn’t confirm the payment yet.";
    message.textContent =
      "Please check your Stripe confirmation or contact ray@afterhours.foundation before trying again.";
    return;
  }
  const payment = await Result.tryPromise(() => status.value.json());
  if (payment.isOk() && payment.value.paymentStatus === "paid") {
    title.textContent = "Thank you for your support.";
    message.textContent = `Your ${formatUsd(payment.value.amountCents)} contribution helps curious people keep making things.`;
    Result.try(() => sessionStorage.removeItem("afterhours-contribution-draft"));
  } else {
    title.textContent = "Your payment hasn’t been confirmed yet.";
    message.textContent =
      "Some payment methods take time to settle. Please check your Stripe confirmation or contact us before trying again.";
  }
}
