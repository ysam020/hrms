import http from "http";
import { randomUUID } from "crypto";
import winston from "winston";
import WinstonCloudWatch from "winston-cloudwatch";
import {
  register,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from "prom-client";
import { requestIdStorage, getRequestId } from "./requestContext";

export { requestIdStorage, getRequestId } from "./requestContext";

const env = process.env.NODE_ENV === "production" ? "production" : "dev";
const serviceName =
  process.env.SERVICE_NAME || process.env.npm_package_name || "api-gateway";

// ── Prometheus ───────────────────────────────────────────────────────────────
collectDefaultMetrics({ labels: { service: serviceName, env } });

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

export const grpcRequestDuration = new Histogram({
  name: "grpc_request_duration_ms",
  help: "Duration of gRPC requests in milliseconds",
  labelNames: ["method", "service"],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
});

export const grpcRequestsTotal = new Counter({
  name: "grpc_requests_total",
  help: "Total number of gRPC requests",
  labelNames: ["method", "service"],
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

if (process.env.LOKI_URL) {
  const LokiTransport = require("winston-loki");
  transports.push(
    new LokiTransport({
      host: process.env.LOKI_URL,
      labels: { service: serviceName, env },
      // json:true sends plain HTTP JSON (no protobuf), avoiding structured metadata rejection
      json: true,
      // No extra format here — the global logger format already serialises to JSON.
      // Adding format:json() again would double-escape the log line string.
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
if (process.env.NODE_ENV !== "test") {
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

// Recursively convert Error instances to plain objects so JSON.stringify
// captures message/stack (which are non-enumerable on Error).
// Mutates in place to preserve Symbol(level) on the TransformableInfo.
const serializeErrors = winston.format((info) => {
  const convert = (val: unknown): unknown => {
    if (val instanceof Error) {
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
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports,
});

// ── Metrics HTTP server (auto-started when METRICS_PORT is set) ───────────────
const metricsPort = process.env.METRICS_PORT
  ? parseInt(process.env.METRICS_PORT, 10)
  : null;

if (metricsPort) {
  http
    .createServer(async (req, res) => {
      if (req.url === "/metrics") {
        const metrics = await register.metrics();
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
    const result = await next();
    const duration = Date.now() - start;
    grpcRequestDuration.observe({ method, service: serviceName }, duration);
    grpcRequestsTotal.inc({ method, service: serviceName });
    logger.info("gRPC Response", { duration: `${duration}ms`, requestId });
    return result;
  });
};
