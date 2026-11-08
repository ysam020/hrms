import { describe, it, expect } from "vitest";
import {
  backoffDelay,
  decideAfterFailure,
  isRetryable,
  DEFAULT_RECONNECT,
} from "../../../shared-core/core/realtime/reconnectPolicy";

// Bounded exponential backoff with full jitter; no retry with a
// refused/revoked token until it changes.
describe("reconnectPolicy", () => {
  it("full jitter: delay is within [0, min(cap, base·2^attempt))", () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const ceiling = Math.min(
        DEFAULT_RECONNECT.maxMs,
        DEFAULT_RECONNECT.baseMs * 2 ** attempt,
      );
      expect(backoffDelay(attempt, DEFAULT_RECONNECT, () => 0)).toBe(0);
      expect(
        backoffDelay(attempt, DEFAULT_RECONNECT, () => 0.999999),
      ).toBeLessThan(ceiling);
    }
  });

  it("is capped (no unbounded growth) at 30 s", () => {
    expect(backoffDelay(50, DEFAULT_RECONNECT, () => 0.999999)).toBeLessThan(
      30_000,
    );
  });

  it("spreads a fleet: 1,000 clients reconnecting after the same outage don't line up", () => {
    const delays = Array.from({ length: 1000 }, () => backoffDelay(5));
    const buckets = new Set(delays.map((d) => Math.floor(d / 1000)));
    expect(buckets.size).toBeGreaterThan(20); // across ~32 one-second buckets
  });

  it.each([
    [{ data: { code: "AUTH_CHECK_UNAVAILABLE", retryable: true } }, true],
    [{ message: "xhr poll error" }, true],
    [undefined, true],
    [{ data: { code: "AUTH_REJECTED", retryable: false } }, false],
    [{ data: { code: "SESSION_REVOKED", retryable: false } }, false],
  ])("isRetryable(%o) = %s", (err, expected) => {
    expect(isRetryable(err as any)).toBe(expected);
  });

  it("a refusal waits for a NEW token instead of retrying the old one", () => {
    const d = decideAfterFailure(
      { data: { code: "AUTH_REJECTED", retryable: false } },
      0,
      "tok-1",
      DEFAULT_RECONNECT,
      () => 0,
    );
    expect(d).toEqual({
      action: "awaitNewToken",
      delayMs: DEFAULT_RECONNECT.baseMs,
      staleToken: "tok-1",
    });
  });

  it("a temporary failure retries with backoff", () => {
    const d = decideAfterFailure(
      { data: { code: "AUTH_CHECK_UNAVAILABLE", retryable: true } },
      3,
      "tok-1",
      DEFAULT_RECONNECT,
      () => 0.5,
    );
    expect(d).toEqual({ action: "retry", delayMs: 4000 });
  });
});
