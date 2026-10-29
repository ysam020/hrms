import { PENDING_FORM_KEY } from "@web/features/auth/org-setup/types";

/**
 * Keys that outlive a sign-out because they belong to the device or to a
 * payment rather than to the session:
 * - px-appearance / theme: the viewer's Light / Dark / Match System choice.
 * - PENDING_FORM_KEY: the organisation form saved after a Razorpay payment
 *   succeeded but before the organisation was created. Setup resumes from
 *   it on the next sign-in (the server's pending-setup record is per
 *   account, so it only resumes for the person who paid); dropping it would
 *   send them back through checkout.
 */
const KEEP = ["px-appearance", "theme", PENDING_FORM_KEY];

/** Clear session data from localStorage, keeping device-level preferences. */
export function clearStorageOnSignOut() {
  try {
    const kept = KEEP.map((k) => [k, localStorage.getItem(k)] as const);
    localStorage.clear();
    for (const [k, v] of kept) if (v !== null) localStorage.setItem(k, v);
  } catch {
    // Storage unavailable (private mode, blocked site data): nothing to clear.
  }
}
