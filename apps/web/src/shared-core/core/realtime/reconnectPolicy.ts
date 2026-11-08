/**
 * When and how fast the realtime socket reconnects.
 *
 * Pure (no timers, no socket): SocketContext asks it what to do after each
 * failure. Rules:
 *  - Retryable failures (server couldn't verify the session right now —
 *    `AUTH_CHECK_UNAVAILABLE` — network errors, server restarts) retry with
 *    FULL-JITTER exponential backoff: random(0, min(cap, base·2^attempt)).
 *    Jitter spreads a fleet of clients so a recovering database isn't hit
 *    by every client at the same instant.
 *  - A definitive refusal (`AUTH_REJECTED`: token invalid/expired, or the
 *    person may no longer connect) or a revocation (`session-expired`) does
 *    NOT retry with the same token. It waits until the access token in
 *    memory changes (a successful HTTP refresh) and then retries once more;
 *    if the person was revoked, the refresh itself fails and the app signs
 *    them out — the socket never hammers the server meanwhile.
 */
export interface ReconnectConfig {
  baseMs: number;
  maxMs: number;
}
export const DEFAULT_RECONNECT: ReconnectConfig = {
  baseMs: 1_000,
  maxMs: 30_000,
};

export interface SocketErrorLike {
  message?: string;
  data?: { code?: string; retryable?: boolean };
}

export function isRetryable(err: SocketErrorLike | undefined): boolean {
  // No structured data (network failure, older server): retry.
  if (!err?.data) return true;
  return err.data.retryable !== false;
}

export function backoffDelay(
  attempt: number,
  cfg: ReconnectConfig = DEFAULT_RECONNECT,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(cfg.maxMs, cfg.baseMs * 2 ** Math.max(0, attempt));
  return Math.floor(random() * ceiling);
}

export type ReconnectDecision =
  | { action: "retry"; delayMs: number }
  /** Re-check after delayMs whether the token changed; connect only then. */
  | { action: "awaitNewToken"; delayMs: number; staleToken: string | null };

export function decideAfterFailure(
  err: SocketErrorLike | undefined,
  attempt: number,
  currentToken: string | null,
  cfg: ReconnectConfig = DEFAULT_RECONNECT,
  random: () => number = Math.random,
): ReconnectDecision {
  const delayMs = backoffDelay(attempt, cfg, random);
  return isRetryable(err)
    ? { action: "retry", delayMs }
    : {
        action: "awaitNewToken",
        delayMs: Math.max(delayMs, cfg.baseMs),
        staleToken: currentToken,
      };
}
