/**
 * Development deliberately shares production's database and third-party
 * credentials. These checks stop a developer's process from acting on that
 * data by accident: no real email, push or live payment call, and no
 * background job that writes to shared records.
 *
 * Decided by the actual database host, because NODE_ENV alone says nothing
 * about where writes go. ALLOW_DEV_SIDE_EFFECTS=true overrides for a
 * deliberate test.
 */

const hostOf = (uri: string): string =>
  uri
    .replace(/^[a-z+]+:\/\/(?:[^@/]*@)?/i, "")
    .split(/[/:?,]/)[0]
    .toLowerCase();

/** True for a non-production process connected to a non-local database. */
export function isNonProductionOnSharedDatabase(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  const host = hostOf(env.DEV_MONGODB_URI ?? "");
  return (
    host !== "" &&
    host !== "localhost" &&
    host !== "127.0.0.1" &&
    host.includes(".")
  );
}

export function outboundSideEffectsAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.ALLOW_DEV_SIDE_EFFECTS === "true" ||
    !isNonProductionOnSharedDatabase(env)
  );
}

export class DevSideEffectBlockedError extends Error {
  constructor(action: string) {
    super(`Blocked in a non-production process: ${action}`);
    this.name = "DevSideEffectBlockedError";
  }
}

/** Live-mode Razorpay keys are real money; test-mode keys are not. */
export function assertLivePaymentAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (
    (env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_live_") &&
    !outboundSideEffectsAllowed(env)
  ) {
    throw new DevSideEffectBlockedError("live Razorpay call");
  }
}
