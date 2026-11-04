/** @fileoverview First-step donation details, local draft recovery, and hosted checkout navigation. */
import { Result } from "better-result";

import { formatUsd, quoteContribution } from "../public/contribution-amounts.js";
import { configureContributionForm } from "./configure-contribution-form.ts";
import { showContributionStatus } from "./show-contribution-status.ts";

/** Connect the first-step form to hosted Stripe Checkout without exposing credentials. */
async function initialize() {
  const form = document.querySelector<HTMLFormElement>("#contribution-form");
  const name = document.querySelector<HTMLInputElement>("#donor-name");
  const email = document.querySelector<HTMLInputElement>("#donor-email");
  const note = document.querySelector<HTMLTextAreaElement>("#donor-message");
  const amount = document.querySelector<HTMLInputElement>("#donation-amount");
  const goods = document.querySelector<HTMLInputElement>("#goods");
  const cover = document.querySelector<HTMLInputElement>("#cover-processing");
  const button = document.querySelector<HTMLButtonElement>("#continue-button");
  const attempt = document.querySelector<HTMLInputElement>("#attempt");
  const notice = document.querySelector<HTMLElement>("#form-notice");
  const total = document.querySelector<HTMLElement>("#total-amount");
  const processingLabel = document.querySelector<HTMLElement>("#processing-label");
  const sandboxNotice = document.querySelector<HTMLElement>("#sandbox-notice");
  if (
    !form ||
    !name ||
    !email ||
    !note ||
    !amount ||
    !goods ||
    !cover ||
    !button ||
    !attempt ||
    !notice ||
    !total ||
    !processingLabel ||
    !sandboxNotice
  )
    return;
  const query = new URLSearchParams(location.search);
  const storageKey = "afterhours-contribution-draft";

  const showNotice = (text: string) => {
    notice.textContent = text;
    notice.hidden = false;
  };
  const updateQuote = () => {
    const cents = Math.round(amount.valueAsNumber * 100);
    const valid = Number.isSafeInteger(cents) && cents >= 100;
    const quote = quoteContribution(valid ? cents : 0, cover.checked);
    total.textContent = valid ? formatUsd(quote.totalCents) : "—";
    if (total.parentElement) total.parentElement.hidden = !valid || !cover.checked;
    const extra = quoteContribution(valid ? cents : 0, true).supportCents;
    processingLabel.textContent = valid
      ? `Add ${formatUsd(extra)} to help with processing costs`
      : "Add $0.00 to help with processing costs";
  };
  const stored = Result.try(() => sessionStorage.getItem(storageKey));
  if (stored.isOk() && stored.value) {
    const saved = new URLSearchParams(stored.value);
    name.value = saved.get("name") || "";
    email.value = saved.get("email") || "";
    note.value = saved.get("message") || "";
    amount.value = saved.get("amount") || "";
    goods.checked = saved.get("goods") === "yes";
    cover.checked = saved.get("coverProcessing") === "yes";
  }
  attempt.value = crypto.randomUUID();
  form.addEventListener("input", updateQuote);
  form.addEventListener("submit", () => {
    const draft = new URLSearchParams({
      name: name.value,
      email: email.value,
      message: note.value,
      amount: amount.value,
      goods: goods.checked ? "yes" : "no",
      coverProcessing: cover.checked ? "yes" : "no",
    });
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
  await configureContributionForm(button, sandboxNotice, notice);
  if (button.disabled) return;
  const sessionId = query.get("session_id");
  if (!sessionId) return;
  await showContributionStatus(sessionId, form);
}

await initialize();
