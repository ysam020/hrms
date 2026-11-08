import http from "http";
import cluster from "node:cluster";
import { randomUUID } from "crypto";
import { performance } from "node:perf_hooks";
import winston from "winston";
import WinstonCloudWatch from "winston-cloudwatch";
import { status as grpcStatus } from "@grpc/grpc-js";
import {
  register,
  collectDefaultMetrics,
  AggregatorRegistry,
  Counter,
  Histogram,
  Gauge,
} from "prom-client";
import { requestIdStorage, getRequestId } from "./requestContext";

export { requestIdStorage, getRequestId } from "./requestContext";
import {
  classifyField,
  omittedMarker,
  redactForLog,
  REDACTED,
} from "./redaction";
export {
  classifyField,
  normalizeKey,
  redactSensitive,
  redactForLog,
  scrubText,
  omittedMarker,
  REDACTED,
  MAX_SNAPSHOT_STRING_BYTES,
} from "./redaction";
export type { FieldClass } from "./redaction";

// The deployment's own environment name (production / staging) labels logs
// and metrics; staging runs NODE_ENV=production, so NODE_ENV alone would
// label it "production". Local development keeps the historical "dev".
const deployEnv = process.env.DEPLOY_ENV;
const env =
  deployEnv && deployEnv !== "development" && deployEnv !== "test"
    ? deployEnv
    : process.env.NODE_ENV === "production"
      ? "production"
      : "dev";
const serviceName =
  process.env.SERVICE_NAME || process.env.npm_package_name || "api-gateway";

// ── Prometheus ───────────────────────────────────────────────────────────────
collectDefaultMetrics({ labels: { service: serviceName, env } });

// Event-loop utilisation (share of wall time the loop was busy) since the
// previous scrape, per process; the cluster primary reports the busiest
// worker. Lag says the loop was blocked; ELU says how close to saturation
// it runs.
let lastElu = performance.eventLoopUtilization();
new Gauge({
  name: "nodejs_eventloop_utilization_ratio",
  help: "Event-loop utilisation (0–1) since the previous scrape",
  labelNames: ["service"],
  aggregator: "max",
  collect() {
    const now = performance.eventLoopUtilization();
    this.set(
      { service: serviceName },
      performance.eventLoopUtilization(now, lastElu).utilization,
    );
    lastElu = now;
  },
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in milliseconds",
  labelNames: ["method", "route", "status", "service"],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
});

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status", "service"],
});

// `outcome` is "ok", "app_error" (handled; the reply says success: false —
// how most handlers report failures) or the gRPC status name of a thrown
// error. Calls that threw used to record nothing at all. Buckets go past
// 1 s because typical calls already sit near it (Atlas round trips).
export const grpcRequestDuration = new Histogram({
  name: "grpc_request_duration_ms",
  help: "Duration of gRPC requests in milliseconds",
  labelNames: ["method", "service", "outcome"],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
});

export const grpcRequestsTotal = new Counter({
  name: "grpc_requests_total",
  help: "Total number of gRPC requests",
  labelNames: ["method", "service", "outcome"],
});

// A failed publish here means a cross-instance WebSocket event (a direct
// message, a broadcast, or a notification) never reaches the user on
// another worker/process — previously only logged, with nothing to alert
// on. See packages/websocket/src/RedisWebSocketAdapter.ts and
// RedisNotificationPublisher.ts.
export const websocketPublishFailuresTotal = new Counter({
  name: "websocket_publish_failures_total",
  help: "Total number of failed Redis pub/sub publishes for WebSocket delivery",
  labelNames: ["method", "service"],
});

// Redis pub/sub can't replay messages sent while a subscriber connection was
// down, so any invalidation published during that window is missed forever
// for this process — see packages/cache/src/CacheManager.ts, which reacts
// to each reconnect by flushing its whole in-process cache rather than
// leaving it to expire naturally via TTL (up to 4h for salary-tagged keys).
export const cacheInvalidationSubscriberReconnectsTotal = new Counter({
  name: "cache_invalidation_subscriber_reconnects_total",
  help: "Total number of times a CacheManager's invalidation subscriber reconnected to Redis",
  labelNames: ["service"],
});

// Tool calls from external AI assistants over MCP (see
// api-gateway/src/mcp). `outcome` is ok | denied | invalid | error, so an
// unusual rate of denied calls (an assistant probing for data its user
// can't see) is something to alert on, not just a log line.
export const mcpToolCallsTotal = new Counter({
  name: "mcp_tool_calls_total",
  help: "Total number of MCP tool calls",
  labelNames: ["tool", "outcome", "service"],
});

export const mcpToolCallDuration = new Histogram({
  name: "mcp_tool_call_duration_ms",
  help: "Duration of MCP tool calls in milliseconds",
  labelNames: ["tool", "service"],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
});

// Cache (packages/cache). `family` is the key's family segment ("settings",
// "dashboard", …) — never a tenant, user or record id. `result`: hit_memory,
// hit_redis, miss, coalesced, set, invalidate, loader_error, redis_error.
export const cacheOperationsTotal = new Counter({
  name: "cache_operations_total",
  help: "Cache lookups, fills and invalidations by outcome",
  labelNames: ["family", "result", "service"],
});

export const cacheLoaderDuration = new Histogram({
  name: "cache_loader_duration_ms",
  help: "Time to compute a value on a cache miss, in milliseconds",
  labelNames: ["family", "service"],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
});

export const cacheRedisDuration = new Histogram({
  name: "cache_redis_duration_ms",
  help: "Duration of cache reads and writes against Redis, in milliseconds",
  labelNames: ["op", "service"],
  buckets: [0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250],
});

// Account-access checks (api-gateway authenticate / sockets).
// `result`: hit (cached decision), miss_allowed, miss_denied,
// unavailable_timeout, unavailable_error, breaker_open. No ids, ever.
export const accountAccessChecksTotal = new Counter({
  name: "account_access_checks_total",
  help: "Account/membership checks by outcome",
  labelNames: ["result", "service"],
});

export const accountAccessCheckDuration = new Histogram({
  name: "account_access_check_duration_ms",
  help: "Duration of uncached account/membership checks, in milliseconds",
  labelNames: ["service"],
  buckets: [1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
});

// Rate-limit store mode: 0 = Redis (global), 1 = in-process
// memory fallback (per-process counters).
export const rateLimitStoreDegraded = new Gauge({
  name: "rate_limit_store_degraded",
  help: "1 while rate limiting has fallen back to per-process memory",
  labelNames: ["service"],
});

export const rateLimitStoreFailoversTotal = new Counter({
  name: "rate_limit_store_failovers_total",
  help: "Times rate limiting fell back from Redis to per-process memory",
  labelNames: ["service"],
});

// ── Transports ───────────────────────────────────────────────────────────────
const logGroupName =
  process.env.AWS_CLOUDWATCH_LOG_GROUP || `/hrms/${serviceName}/${env}`;

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      }),
    ),
  }),
];

// winston-loki sends every metadata field as Loki structured metadata, which
// must be string-valued: one line carrying an object or a number (an error,
// a request body, a status code) made Loki reject its whole batch with a
// 400, so most request and error logs never arrived. This builds the line
// winston-loki itself would ("<message> <json meta>") and leaves only the
// level behind as metadata.
const LOKI_KEPT_KEYS = new Set([
  "level",
  "label",
  "labels",
  "timestamp",
  "message",
]);
export const lokiLineFormat = winston.format((info) => {
  const { label, labels, timestamp, message, ...meta } = info;
  void label;
  void labels;
  void timestamp;
  (info as Record<symbol, unknown>)[Symbol.for("message")] =
    `${message} ${Object.keys(meta).length > 0 ? JSON.stringify(meta) : ""}`;
  for (const key of Object.keys(info)) {
    if (!LOKI_KEPT_KEYS.has(key)) delete (info as Record<string, unknown>)[key];
  }
  return info;
})();

if (process.env.LOKI_URL) {
  // Loaded only when Loki is configured, so services without it never load it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const LokiTransport = require("winston-loki");
  transports.push(
    new LokiTransport({
      host: process.env.LOKI_URL,
      labels: { service: serviceName, env },
      // json:true sends plain HTTP JSON (no protobuf).
      json: true,
      // Giving the transport a format makes winston-loki use the line built
      // above instead of building its own; see lokiLineFormat.
      format: lokiLineFormat,
      replaceTimestamp: true,
      gracefulShutdown: true,
      onConnectionError: (err: Error) =>
        console.error(`[${serviceName}] Loki connection error:`, err.message),
    }),
  );
}

// Skipped under test: the AWS credential provider chain does a dynamic
// import() to resolve credentials, which Jest's CJS environment can't
// service without --experimental-vm-modules — it fails, then retries
// asynchronously past test teardown ("Cannot log after tests are done").
// No test relies on log output actually reaching CloudWatch.
// CLOUDWATCH_LOGS_DISABLED=true also skips it: the isolated load-testing
// stack logs every request at high volume, which would otherwise become paid
// CloudWatch ingestion (and an unbounded retry buffer without credentials).
if (
  process.env.NODE_ENV !== "test" &&
  process.env.CLOUDWATCH_LOGS_DISABLED !== "true"
) {
  transports.push(
    new WinstonCloudWatch({
      logGroupName,
      logStreamName: process.env.AWS_CLOUDWATCH_LOG_STREAM || "app",
      awsRegion: process.env.AWS_REGION || "ap-south-1",
      jsonMessage: true,
      retentionInDays: env === "production" ? 90 : 7,
    }),
  );
}

// Marks an Error once it has been through a log line, so code further up
// the chain (e.g. the gateway's handleError) can avoid logging it again.
const LOGGED = Symbol.for("hrms.logger.logged");

/** Whether `err` has already been written to a log line. */
export function wasLogged(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as any)[LOGGED] === true;
}

// Recursively convert Error instances to plain objects so JSON.stringify
// captures message/stack (which are non-enumerable on Error). Only those
// three fields are kept: an HTTP client's error also carries its request
// config and headers (credentials), which must not reach a log line.
// Mutates in place to preserve Symbol(level) on the TransformableInfo.
export const serializeErrors = winston.format((info) => {
  const convert = (val: unknown): unknown => {
    if (val instanceof Error) {
      Object.defineProperty(val, LOGGED, { value: true, configurable: true });
      return { message: val.message, name: val.name, stack: val.stack };
    }
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const key of Object.keys(val)) {
        (val as Record<string, unknown>)[key] = convert(
          (val as Record<string, unknown>)[key],
        );
      }
    }
    return val;
  };
  convert(info);
  return info;
})();

// Auto-attaches the ambient requestId (see requestContext.ts) to every log
// line without requiring each call site to pass it explicitly — this is
// what makes correlation-ID propagation actually usable across hundreds of
// existing logger.info/error/warn calls instead of a change nobody adopts.
const attachRequestId = winston.format((info) => {
  const requestId = getRequestId();
  if (requestId && info.requestId === undefined) {
    info.requestId = requestId;
  }
  return info;
})();

// Keeps Aadhaar numbers, credentials, resumes and similar out of every log
// line, whichever transport it goes to — including values echoed inside
// error messages (a Prisma validation error prints the full query
// arguments). Runs after serializeErrors so error messages and stacks are
// plain strings by then. See redaction.ts for the rules.
export const redactSensitiveFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === "level" || key === "timestamp") continue;
    const cls = classifyField(key);
    const value = (info as Record<string, unknown>)[key];
    (info as Record<string, unknown>)[key] =
      cls === "secret" && value != null
        ? REDACTED
        : cls === "omit" && value != null
          ? omittedMarker(value)
          : redactForLog(value);
  }
  return info;
})();

// ── Logger ───────────────────────────────────────────────────────────────────
export const logger = winston.createLogger({
  level:
    process.env.NODE_ENV === "test"
      ? "silent"
      : process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    attachRequestId,
    serializeErrors,
    redactSensitiveFormat,
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports,
});

// ── Metrics HTTP server (auto-started when METRICS_PORT is set) ───────────────
const metricsPort = process.env.METRICS_PORT
  ? parseInt(process.env.METRICS_PORT, 10)
  : null;

// Cluster workers share the service's port, so a server in each worker
// answered every scrape from whichever worker accepted it: Prometheus saw
// counters jump between processes, and rates and histograms were garbage.
// Only the primary listens, and it answers for all of its workers (the
// primary imports this module before forking; see each bootstrap.ts).
// Constructed in every process: prom-client only installs a worker's IPC
// reply to the primary's metrics request once an AggregatorRegistry exists
// in that worker (without it every aggregated scrape timed out).
const aggregator = new AggregatorRegistry();
const hasWorkers = () => Object.keys(cluster.workers ?? {}).length > 0;

if (metricsPort && !cluster.isWorker) {
  http
    .createServer(async (req, res) => {
      if (req.url === "/metrics") {
        let metrics: string;
        try {
          metrics =
            cluster.isPrimary && hasWorkers()
              ? await aggregator.clusterMetrics()
              : await register.metrics();
        } catch (error) {
          logger.warn("metrics scrape failed", { error });
          res.writeHead(500);
          res.end();
          return;
        }
        res.setHeader("Content-Type", register.contentType);
        res.end(metrics);
      } else if (req.url === "/health") {
        res.writeHead(200);
        res.end("OK");
      } else {
        res.writeHead(404);
        res.end();
      }
    })
    .listen(metricsPort, () => {
      logger.info(
        `[${serviceName}] metrics server listening on :${metricsPort}`,
      );
    });
}

// ── Middleware ────────────────────────────────────────────────────────────────
// Generates (or forwards, if a caller/proxy already set one) the
// correlation ID for this request, echoes it back as a response header, and
// runs the rest of the request — including every downstream gRPC call (see
// grpcCall in api-gateway/src/grpc/clients.ts, which forwards it as gRPC
// metadata) and every log line emitted during it — inside its
// AsyncLocalStorage context.
export const apiRequestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  const requestId = (req.headers?.["x-request-id"] as string) || randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  requestIdStorage.run(requestId, () => {
    res.on("finish", () => {
      const duration = Date.now() - start;
      const route = (req.route?.path ??
        req.path ??
        req.url ??
        "unknown") as string;
      const labels = {
        method: req.method as string,
        route,
        status: String(res.statusCode),
        service: serviceName,
      };
      httpRequestDuration.observe(labels, duration);
      httpRequestsTotal.inc(labels);
      logger.info("HTTP Request", {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
        requestId,
      });
    });
    next();
  });
};

// Field-name substrings (case-insensitive) that mark a value as sensitive.
// Matches broadly on purpose — this walks arbitrary proto payloads across
// every service, so over-redacting a borderline field name is far cheaper
// than leaking a token, PAN, bank account, DOB, or WebAuthn credential.
const SENSITIVE_KEY_PATTERN =
  /token|password|secret|credential|pan(?:number)?|bank|account|ifsc|dob|birth|otp|cvv|ssn|aadhaar|salary|ctc|ssn|routingnumber|publickey|privatekey/i;

function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 10 || value === null || value === undefined) return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redactSensitive(val, depth + 1);
    }
    return out;
  }
  return value;
}

// Same mapping as grpc-server's errorHandler: a numeric gRPC status keeps
// its name, anything else (a Prisma error, a plain Error) is INTERNAL.
export function grpcOutcomeOf(error: any): string {
  const code = error?.code;
  return typeof code === "number" && grpcStatus[code]
    ? grpcStatus[code]
    : "INTERNAL";
}

export const grpcApiRequestLogger = async (
  call: any,
  next: () => Promise<any>,
) => {
  // Continue the correlation ID the gateway generated in apiRequestLogger,
  // forwarded as gRPC metadata by grpcCall (api-gateway/src/grpc/clients.ts)
  // alongside x-tenant-id. Falls back to generating one so a call that
  // somehow bypasses the gateway (a direct service-to-service call, a test)
  // still gets a traceable id instead of silently having none.
  const requestId =
    (call.metadata?.get("x-request-id") ?? [])[0] || randomUUID();

  return requestIdStorage.run(requestId, async () => {
    const start = Date.now();
    const method = (call.getPath ? call.getPath() : "unknown") as string;
    logger.info("gRPC Request", {
      method,
      requestId,
      request: redactSensitive(call.request),
    });
    const record = (outcome: string) => {
      const duration = Date.now() - start;
      const labels = { method, service: serviceName, outcome };
      grpcRequestDuration.observe(labels, duration);
      grpcRequestsTotal.inc(labels);
      return duration;
    };
    let result: any;
    try {
      result = await next();
    } catch (error: any) {
      record(grpcOutcomeOf(error));
      throw error;
    }
    const duration = record(result?.success === false ? "app_error" : "ok");
    logger.info("gRPC Response", { duration: `${duration}ms`, requestId });
    return result;
  });
};
