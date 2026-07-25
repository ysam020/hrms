import * as grpc from "@grpc/grpc-js";
import CircuitBreaker from "opossum";
import fs from "fs";
import path from "path";
import { logger } from "@hrms/logger";

export interface GrpcClientConfig {
  serviceName: string;
  address: string;
  credentials?: grpc.ChannelCredentials;
  options?: {
    timeout?: number;
    retries?: number;
    [key: string]: any;
  };
}

// Shared retry policy, exported so any gRPC call site — not just
// BaseGrpcClient's own makeCall — can apply the same retryable-code
// decision and backoff schedule instead of reimplementing it. UNAVAILABLE
// is the one gRPC status that reliably means the request never reached a
// server that could act on it (a connection-level failure), so retrying it
// can't double-execute a non-idempotent mutation the way retrying
// DEADLINE_EXCEEDED could (the server may have received and be processing
// that one slowly). Every other code (INVALID_ARGUMENT, PERMISSION_DENIED,
// NOT_FOUND, ...) is deterministic — retrying it wastes latency without any
// chance of a different outcome.
export const RETRYABLE_GRPC_CODES: ReadonlySet<grpc.status> = new Set([
  grpc.status.UNAVAILABLE,
]);
const RETRY_BASE_DELAY_MS = 100;
const RETRY_MAX_DELAY_MS = 2_000;

export function isRetryableGrpcCode(
  code: grpc.status | undefined | null,
): boolean {
  return code != null && RETRYABLE_GRPC_CODES.has(code);
}

// Full jitter (AWS's "Exponential Backoff And Jitter" — the delay is
// uniformly random between 0 and the capped exponential value, not the
// capped value itself. Plain exponential backoff has every replica retrying
// on the same schedule; under a real transient outage that means every
// caller re-collides with the recovering service at once. Jitter spreads
// those retries out instead of synchronizing them.
export function grpcRetryDelayMs(attempt: number): number {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  return Math.random() * cap;
}

export class BaseGrpcClient {
  protected client: any;
  protected config: GrpcClientConfig;
  // Per-instance (i.e. per downstream service, since each BaseGrpcClient
  // talks to exactly one) — a hard-down service trips this open so callers
  // fail fast instead of every request paying the full retry budget
  // (up to retries×timeout) only to find out the service is unreachable.
  // errorFilter keeps non-connectivity errors (INVALID_ARGUMENT, NOT_FOUND,
  // ...) from counting toward the trip threshold — those are the calling
  // code's fault, not the downstream service being unhealthy.
  private breaker: CircuitBreaker<[string, any, number], any>;

  constructor(config: GrpcClientConfig) {
    this.config = config;
    this.setupClient();
    this.breaker = new CircuitBreaker(
      (method: string, request: any, deadlineMs: number) =>
        this.callOnce(method, request, deadlineMs),
      {
        name: `grpc:${config.serviceName}`,
        // Deadline is already enforced natively via the grpc call's own
        // `deadline` option in callOnce — a second, opossum-level timeout
        // racing it would just add a confusing second failure mode.
        timeout: false,
        errorThresholdPercentage: 50,
        // Without a volume floor, opossum will trip on a single failed call
        // (100% error rate over a sample size of 1) — which is exactly what
        // one client's own retry-after-UNAVAILABLE burst looks like. Require
        // a real pattern across multiple calls (this client's own retries
        // plus other concurrent callers) before tripping, so retrying a
        // single transient blip can't itself open the breaker.
        volumeThreshold: 5,
        rollingCountTimeout: 10_000,
        resetTimeout: 30_000,
        errorFilter: (err: any) => !isRetryableGrpcCode(err?.code),
      },
    );
    // opossum invokes the fallback on *every* unfiltered failure, not only
    // when the breaker is actually open (it's also opossum's generic
    // "replace the rejection" hook for a single failed call) — so this must
    // check for the specific error opossum itself throws when short-
    // circuiting an open breaker (code "EOPENBREAKER") and only replace
    // *that* one. Any other failure is a real call that reached the
    // service and got a real error back; rethrow it unchanged so callers
    // keep seeing the original grpc status/message.
    this.breaker.fallback(
      (_method: string, _request: any, _deadlineMs: number, err: any) => {
        if (err?.code === "EOPENBREAKER") {
          const breakerErr: any = new Error(
            `Circuit breaker open for "${config.serviceName}" — too many recent failures, failing fast instead of waiting on a call that's unlikely to succeed.`,
          );
          breakerErr.code = grpc.status.UNAVAILABLE;
          throw breakerErr;
        }
        throw err;
      },
    );
    this.breaker.on("open", () =>
      logger.warn(`gRPC circuit breaker opened for "${config.serviceName}"`),
    );
    this.breaker.on("close", () =>
      logger.info(`gRPC circuit breaker closed for "${config.serviceName}"`),
    );
  }

  private buildDefaultCredentials(): grpc.ChannelCredentials {
    const caFile =
      process.env.GRPC_TLS_CA_FILE ??
      path.resolve(__dirname, "../../certificates/rootCA.pem");
    // mTLS: present our own cert/key so the server can verify who's
    // calling, not just that we trust the server's cert. See
    // base-server.ts's buildServerCredentials, which now requires this.
    //
    // Must be a distinct identity from the servers' own cert.pem/key.pem:
    // grpc-js resets the connection (ECONNRESET) if the client presents a
    // certificate identical to the server's own — see the matching note in
    // api-gateway's grpc/clients.ts, which hit and confirmed this.
    const certFile =
      process.env.GRPC_TLS_CLIENT_CRT_FILE ??
      path.resolve(__dirname, "../../certificates/client-cert.pem");
    const keyFile =
      process.env.GRPC_TLS_CLIENT_KEY_FILE ??
      path.resolve(__dirname, "../../certificates/client-key.pem");

    return grpc.credentials.createSsl(
      fs.readFileSync(caFile),
      fs.readFileSync(keyFile),
      fs.readFileSync(certFile),
      { checkServerIdentity: () => undefined },
    );
  }

  private setupClient() {
    const options = {
      "grpc.keepalive_time_ms": 120000,
      "grpc.http2.min_time_between_pings_ms": 120000,
      "grpc.keepalive_timeout_ms": 20000,
      "grpc.http2.max_pings_without_data": 0,
      "grpc.keepalive_permit_without_calls": 1,
    };

    // timeout/retries are call-level concerns (see makeCall below), not
    // grpc.js channel options — keep them out of the channel-options object
    // passed to the native channel constructor.
    const {
      timeout: _timeout,
      retries: _retries,
      ...channelOptions
    } = this.config.options ?? {};

    this.client = new grpc.Client(
      this.config.address,
      this.config.credentials ?? this.buildDefaultCredentials(),
      {
        ...options,
        ...channelOptions,
      },
    );
  }

  private callOnce(
    method: string,
    request: any,
    deadlineMs: number,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client[method](
        request,
        { deadline: Date.now() + deadlineMs },
        (error: any, response: any) => {
          if (error) reject(error);
          else resolve(response);
        },
      );
    });
  }

  // Previously: config.options.timeout/retries were accepted but never
  // read — a caller configuring { retries: 3 } got silent no-op behavior, a
  // false sense of resilience. Both are now applied: timeout becomes the
  // per-call deadline, retries is the number of additional attempts made
  // after the first failure, using the shared retry policy above.
  async makeCall(method: string, request: any): Promise<any> {
    const deadlineMs = this.config.options?.timeout ?? 8_000;
    const retries = this.config.options?.retries ?? 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.breaker.fire(method, request, deadlineMs);
      } catch (error: any) {
        const isLastAttempt = attempt === retries;
        if (isLastAttempt || !isRetryableGrpcCode(error?.code)) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, grpcRetryDelayMs(attempt)),
        );
      }
    }
    // Unreachable: the loop above always either returns or throws, but
    // TypeScript can't prove that (attempt is bounded by a runtime value,
    // not a literal), so a function typed to return Promise<any> needs an
    // explicit terminal statement here to satisfy noImplicitReturns.
    throw new Error("unreachable");
  }
}
