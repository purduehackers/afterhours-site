/** @fileoverview Restore donor details and open hosted Checkout without exposing credentials. */
import { Result } from "better-result";

import { formatUsd, quoteContribution } from "../lib/contribution-amounts.ts";

const storageKey = "afterhours-contribution-draft";

/** Checkbox drafts use yes/no values instead of their displayed text. */
function isCheckbox(field: HTMLInputElement | HTMLTextAreaElement): field is HTMLInputElement {
  return field instanceof HTMLInputElement && field.type === "checkbox";
}

/** Confirm payment with the server before showing a paid acknowledgment. */
async function showStatus(sessionId: string, form: HTMLFormElement) {
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
    Result.try(() => sessionStorage.removeItem(storageKey));
  } else {
    title.textContent = "Your payment hasn’t been confirmed yet.";
    message.textContent =
      "Some payment methods take time to settle. Please check your Stripe confirmation or contact us before trying again.";
  }
}

/** Keep drafts in this tab and enable payment only when the server is ready. */
async function initialize() {
  const form = document.querySelector<HTMLFormElement>("#contribution-form");
  const button = document.querySelector<HTMLButtonElement>("#continue-button");
  const attempt = document.querySelector<HTMLInputElement>("#attempt");
  const notice = document.querySelector<HTMLElement>("#form-notice");
  const total = document.querySelector<HTMLElement>("#total-amount");
  const processingLabel = document.querySelector<HTMLElement>("#processing-label");
  const sandboxNotice = document.querySelector<HTMLElement>("#sandbox-notice");
  if (!form || !button || !attempt || !notice || !total || !processingLabel || !sandboxNotice)
    return;
  const fields = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "input:not([type=hidden]):not([name=website]), textarea",
  );
  const query = new URLSearchParams(location.search);
  const showNotice = (text: string) => {
    notice.textContent = text;
    notice.hidden = false;
  };
  const updateQuote = () => {
    const data = new FormData(form);
    const cents = Math.round(Number(data.get("amount")) * 100);
    const valid = Number.isSafeInteger(cents) && cents >= 100;
    const cover = data.has("coverProcessing");
    const quote = quoteContribution(valid ? cents : 0, cover);
    total.textContent = valid ? formatUsd(quote.totalCents) : "—";
    if (total.parentElement) total.parentElement.hidden = !valid || !cover;
    const extra = quoteContribution(valid ? cents : 0, true).supportCents;
    processingLabel.textContent = valid
      ? `Add ${formatUsd(extra)} to help with processing costs`
      : "Add $0.00 to help with processing costs";
  };
  const stored = Result.try(() => sessionStorage.getItem(storageKey));
  if (stored.isOk() && stored.value) {
    const saved = new URLSearchParams(stored.value);
    for (const field of fields) {
      if (isCheckbox(field)) field.checked = saved.get(field.name) === "yes";
      else field.value = saved.get(field.name) || "";
    }
  }
  attempt.value = crypto.randomUUID();
  form.addEventListener("input", updateQuote);
  form.addEventListener("submit", () => {
    const draft = new URLSearchParams();
    for (const field of fields) {
      if (isCheckbox(field)) draft.set(field.name, field.checked ? "yes" : "no");
      else draft.set(field.name, field.value);
    }
    Result.try(() => sessionStorage.setItem(storageKey, draft.toString()));
    button.disabled = true;
    button.textContent = "Opening secure checkout…";
  });
  window.addEventListener("pageshow", () => {
    button.disabled = button.dataset.ready !== "yes";
    button.textContent = "Continue →";
  });
  updateQuote();
  if (query.has("error"))
    showNotice(
      "We couldn’t open checkout. Please check your details and try again, or email ray@afterhours.foundation.",
    );
  if (query.has("canceled"))
    showNotice("Your checkout was canceled. You can change your details and try again.");
  const unavailable =
    "Contributions are temporarily unavailable. Please email ray@afterhours.foundation.";
  const response = await Result.tryPromise(() => fetch("/api/contributions"));
  if (response.isErr() || !response.value.ok) {
    showNotice(unavailable);
    return;
  }
  const config = await Result.tryPromise(() => response.value.json());
  if (config.isErr() || !config.value.ready) {
    showNotice(unavailable);
    return;
  }
  sandboxNotice.hidden = !config.value.sandbox;
  button.dataset.ready = "yes";
  button.disabled = false;
  const sessionId = query.get("session_id");
  if (sessionId) await showStatus(sessionId, form);
}

await initialize();
