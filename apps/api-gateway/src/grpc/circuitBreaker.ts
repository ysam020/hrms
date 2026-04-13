import { logger } from "@hrms/logger";

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerOptions {
  /** Number of consecutive failures before the circuit opens. Default: 5 */
  failureThreshold?: number;
  /** How long (ms) to keep the circuit open before trying half-open. Default: 30 000 */
  resetTimeoutMs?: number;
  /** How many probe calls are allowed in half-open state. Default: 1 */
  halfOpenProbes?: number;
}

/**
 * Per-service circuit breaker.
 *
 * State machine:
 *   CLOSED  → normal operation; failures are counted.
 *   OPEN    → all calls rejected immediately for `resetTimeoutMs`.
 *   HALF-OPEN → one probe call is allowed; success → CLOSED, failure → OPEN.
 *
 * Usage:
 *   const cb = new CircuitBreaker("auth-service");
 *   const result = await cb.call(() => grpcCall(authClient, "login", req));
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private probesInFlight = 0;
  private openedAt = 0;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenProbes: number;

  constructor(name: string, opts: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.halfOpenProbes = opts.halfOpenProbes ?? 1;
  }

  private trip(): void {
    this.state = "open";
    this.openedAt = Date.now();
    logger.warn(
      `Circuit breaker [${this.name}] OPENED after ${this.failures} failures`,
    );
  }

  private reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.probesInFlight = 0;
    logger.info(`Circuit breaker [${this.name}] CLOSED — service recovered`);
  }

  private maybeTransitionToHalfOpen(): boolean {
    if (
      this.state === "open" &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      this.state = "half-open";
      this.probesInFlight = 0;
      logger.info(`Circuit breaker [${this.name}] HALF-OPEN — probing service`);
      return true;
    }
    return false;
  }

  /**
   * Wraps a gRPC call with circuit-breaker logic.
   * Throws `CircuitOpenError` when the circuit is open and the timeout has not elapsed.
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (!this.maybeTransitionToHalfOpen()) {
        throw new CircuitOpenError(this.name);
      }
    }

    if (this.state === "half-open") {
      if (this.probesInFlight >= this.halfOpenProbes) {
        // Already have a probe in flight — reject further calls until it resolves
        throw new CircuitOpenError(this.name);
      }
      this.probesInFlight++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.reset();
    } else {
      // Reset consecutive failure count on any success
      this.failures = 0;
    }
  }

  private onFailure(): void {
    if (this.state === "half-open") {
      this.probesInFlight = Math.max(0, this.probesInFlight - 1);
      this.trip();
    } else {
      this.failures++;
      if (this.failures >= this.failureThreshold) {
        this.trip();
      }
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker [${name}] is OPEN — downstream service unavailable`);
    this.name = "CircuitOpenError";
  }
}

// ─── Per-service singletons ───────────────────────────────────────────────────
// One breaker per downstream gRPC service so a single unhealthy service
// cannot cascade into unrelated services.

export const breakers: Record<string, CircuitBreaker> = {
  auth: new CircuitBreaker("auth-service"),
  user: new CircuitBreaker("user-service"),
  employee: new CircuitBreaker("employee-service"),
  attendance: new CircuitBreaker("attendance-service"),
  leave: new CircuitBreaker("leave-service"),
  recruitment: new CircuitBreaker("recruitment-service"),
  hrm: new CircuitBreaker("hrm-service"),
  salary: new CircuitBreaker("salary-service"),
  analytics: new CircuitBreaker("analytics-service"),
  notification: new CircuitBreaker("notification-service"),
};
