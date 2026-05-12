import http from "http";
import winston from "winston";
import WinstonCloudWatch from "winston-cloudwatch";
import {
  register,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from "prom-client";

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

transports.push(
  new WinstonCloudWatch({
    logGroupName,
    logStreamName: process.env.AWS_CLOUDWATCH_LOG_STREAM || "app",
    awsRegion: process.env.AWS_REGION || "ap-south-1",
    jsonMessage: true,
    retentionInDays: env === "production" ? 90 : 7,
  }),
);

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

// ── Logger ───────────────────────────────────────────────────────────────────
export const logger = winston.createLogger({
  level:
    process.env.NODE_ENV === "test"
      ? "silent"
      : process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
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
export const apiRequestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
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
    });
  });
  next();
};

export const grpcApiRequestLogger = async (
  call: any,
  next: () => Promise<any>,
) => {
  const start = Date.now();
  const method = (call.getPath ? call.getPath() : "unknown") as string;
  logger.info("gRPC Request", { method, request: call.request });
  const result = await next();
  const duration = Date.now() - start;
  grpcRequestDuration.observe({ method, service: serviceName }, duration);
  grpcRequestsTotal.inc({ method, service: serviceName });
  logger.info("gRPC Response", { duration: `${duration}ms` });
  return result;
};
