import { Result } from "better-result";

/** Enable checkout after the server confirms its Stripe credential. */
export async function configureContributionForm(
  button: HTMLButtonElement,
  sandboxNotice: HTMLElement,
  notice: HTMLElement,
) {
  const response = await Result.tryPromise(() => fetch("/api/contributions"));
  if (response.isErr() || !response.value.ok) {
    notice.textContent =
      "Contributions are temporarily unavailable. Please email ray@afterhours.foundation.";
    notice.hidden = false;
    return;
  }
  const config = await Result.tryPromise(() => response.value.json());
  if (config.isErr() || !config.value.ready) {
    notice.textContent =
      "Contributions are temporarily unavailable. Please email ray@afterhours.foundation.";
    notice.hidden = false;
    return;
  }
  sandboxNotice.hidden = !config.value.sandbox;
  button.dataset.ready = "yes";
  button.disabled = false;
}
