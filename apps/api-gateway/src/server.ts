import http2Express from "http2-express-bridge";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import http2 from "http2";
import http from "http";
import fs from "fs";
import path from "path";
import cluster from "node:cluster";
import type { Worker } from "bullmq";
import { apiRequestLogger, logger } from "@hrms/logger";
import { configureSocketIO } from "@hrms/websocket";
import { setupChatSocket } from "./config/chatSocket";
import { setupPresenceSocket } from "./config/presenceSocket";
import { configureSwagger } from "./config/swaggerSetup";
import { generateCsrfToken, doubleCsrfProtection } from "./config/csrf";
import { applyRateLimiters, authLimiter } from "./config/rateLimiters";
import { resolveSocketUserId } from "./config/socketAuth";
import {
  registerGracefulShutdown,
  trackConnections,
} from "./config/gracefulShutdown";
import { closeGrpcClients } from "./grpc/clients";
import { flushTelemetry } from "./telemetry";
import { closeQueues, closeWorker } from "@hrms/queue";
import { rootRouter } from "./routes";
import { auditLogMiddleware } from "./middleware/auditLog";
import { mcpRouter } from "./mcp/router";
import { googleAuthCallback, googleCalendarCallback } from "./handlers/auth";
import { handleWebhook } from "./handlers/payment";
import { handleRazorpayXWebhook } from "./handlers/razorpayxWebhook";
import { startSubscriptionReconciler } from "./services/subscriptionReconciler";
import { startPayrollDisbursementWorker } from "./workers/payrollDisbursementWorker";
import { startPresenceExpiryWorker } from "./workers/presenceExpiryWorker";
import {
  ensureMasterIndexes,
  withQueryStats,
  currentQueryStats,
  endQueryStats,
  summarizeQueryStats,
  recordExternal,
  recordSerialize,
  warmUpDatabase,
  disconnectDatabases,
} from "@hrms/db";
import { setRedisTimingHook } from "@hrms/cache";
import { withUserAccessScope } from "./services/userAccess";

const app = http2Express(express);
const PORT = Number(process.env.API_GATEWAY_PORT) || 9002;

// Trust the first proxy hop so req.ip is correct and rate limiters
// work properly behind a reverse proxy / load balancer.
app.set("trust proxy", 1);

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
  : [];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", ...allowedOrigins],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
// ─── MCP (external AI assistants) ────────────────────────────────────────────
// Mounted before the web app's CORS policy and CSRF middleware: these
// endpoints are called by AI clients from anywhere, authenticate with bearer
// tokens or PKCE rather than cookies, and set their own open CORS policy and
// rate limits. See mcp/router.ts.
app.use(mcpRouter);

app.use(cors({ credentials: true, origin: allowedOrigins }));
app.use(cookieParser());

// ─── Razorpay webhook ────────────────────────────────────────────────────────
// Mounted BEFORE the CSRF middleware and express.json() so that:
//   1. Razorpay's server-to-server requests aren't rejected by CSRF protection.
//   2. req.body arrives as a raw Buffer, preserving the exact bytes Razorpay
//      signed — JSON.stringify(parsedBody) can differ in key order / whitespace.
app.post(
  "/api/v1/payment/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook,
);

// ─── RazorpayX Payout webhook ─────────────────────────────────────────────────
// Same constraints as the PG webhook above:
//   • express.raw() preserves the bytes RazorpayX signed.
//   • Mounted before CSRF so server-to-server calls aren't rejected.
app.post(
  "/api/v1/integrations/razorpayx/webhook",
  express.raw({ type: "application/json" }),
  handleRazorpayXWebhook,
);
// ─────────────────────────────────────────────────────────────────────────────

app.use(doubleCsrfProtection);
const QUERY_COUNT_WARN = Number(process.env.REQUEST_QUERY_COUNT_WARN) || 25;
const QUERY_TIME_WARN_MS = Number(process.env.REQUEST_DB_MS_WARN) || 1000;
// Per-request timing line for every request (route, status, bytes, phase
// and DB/downstream counts — never headers, tokens or query values).
const REQUEST_TIMING_LOG = process.env.REQUEST_TIMING_LOG === "true";
// Adds the ordered list of every DB/Redis/gRPC wait (name, start offset,
// duration; no arguments) to the timing line. For investigations only.
const REQUEST_TIMING_OPS = process.env.REQUEST_TIMING_OPS === "true";

// CacheManager's Redis commands count against the request that issued them.
setRedisTimingHook((op, start, end) =>
  recordExternal("redis", `redis:${op}`, start, end),
);

app.use(apiRequestLogger);

// Per-request database round trips (counts and timings only — no query
// arguments). Logged only for requests that look expensive.
app.use((req, res, next) =>
  withQueryStats(
    () => {
      const started = performance.now();
      const stats = currentQueryStats();
      // res.json = JSON.stringify + ETag + write: time it as serialisation.
      const json = res.json.bind(res);
      res.json = (body: unknown) => {
        const s = performance.now();
        try {
          return json(body);
        } finally {
          recordSerialize(performance.now() - s);
        }
      };
      res.on("close", () => stats && endQueryStats(stats));
      res.on("finish", () => {
        if (!stats) return;
        const timing = summarizeQueryStats(stats, started, {
          ops: REQUEST_TIMING_OPS,
        });
        endQueryStats(stats);
        const heavy =
          stats.count >= QUERY_COUNT_WARN ||
          stats.totalMs >= QUERY_TIME_WARN_MS;
        if (!heavy && !REQUEST_TIMING_LOG) return;
        const line = {
          // Explicit: the ambient request context isn't reliably active
          // inside a "finish" listener.
          requestId: (req as { requestId?: string }).requestId,
          method: req.method,
          route: req.baseUrl + (req.route?.path ?? ""),
          status: res.statusCode,
          bytes: Number(res.getHeader("content-length")) || null,
          ...timing,
        };
        if (heavy) logger.warn("db-heavy request", line);
        else logger.info("request timing", line);
      });
      next();
    },
    { trackOverlap: true },
  ),
);

// One user-access scope per HTTP request: authorisation checks share one
// lookup of the caller's isSuperUser/permissions (services/userAccess.ts).
app.use((_req, _res, next) => withUserAccessScope(next));

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

applyRateLimiters(app);

app.use(auditLogMiddleware);
configureSwagger(app as any);
app.get("/api/v1/csrf-token", (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});
// Callback URL must match the URI registered in Google Cloud Console exactly.
// It intentionally lives outside /api/v1 so it never needs a version bump.
app.get("/api/auth/google/callback", authLimiter, googleAuthCallback);
// Same reasoning as the login callback above — must match the URI
// registered in Google Cloud Console exactly (see GOOGLE_CALENDAR_CALLBACK_URL).
app.get(
  "/api/auth/google-calendar/callback",
  authLimiter,
  googleCalendarCallback,
);
app.use("/api/v1", rootRouter);

app.get("/health", (_req, res) => res.json({ status: "healthy" }));

app.use((error: any, _req: any, res: any, _next: any) => {
  logger.error("Unhandled error:", { error });
  const httpStatus = error.status || error.statusCode || 500;
  const message =
    httpStatus < 500 ? error.message || "Bad request" : "Internal Server Error";
  return res.status(httpStatus).json({ success: false, message });
});

process.on("uncaughtException", (error) =>
  logger.error("Uncaught Exception:", { error }),
);
process.on("unhandledRejection", (error) =>
  logger.error("Unhandled Rejection:", { error }),
);

const certPath = process.env.SSL_CRT_FILE
  ? path.resolve(process.env.SSL_CRT_FILE)
  : path.resolve(__dirname, "../../../packages/certificates/cert.pem");
const keyPath = process.env.SSL_KEY_FILE
  ? path.resolve(process.env.SSL_KEY_FILE)
  : path.resolve(__dirname, "../../../packages/certificates/key.pem");

function startServer(server: http.Server | http2.Http2SecureServer) {
  const { io, redisAdapter } = configureSocketIO(
    server as any,
    allowedOrigins,
    resolveSocketUserId,
  );
  setupChatSocket(io, redisAdapter);
  setupPresenceSocket(io);
  // From the start, so shutdown can tell idle connections from busy ones.
  const connections = trackConnections(server);
  const workers: Worker[] = [];
  let stopBackgroundJobs = () => {};

  // Under cluster mode (see bootstrap.ts) every forked worker would otherwise
  // run these on its own schedule — harmless for the reconciler, but
  // startPayrollDisbursementWorker actually disburses payroll, so running it
  // once per CPU core risks duplicate disbursements. Restrict both to a
  // single designated worker (or the sole process outside cluster mode).
  if (!cluster.isWorker || cluster.worker?.id === 1) {
    void ensureMasterIndexes();
    void import("./migrations/backfillPlanTier").then(({ backfillPlanTier }) =>
      backfillPlanTier(),
    );
    stopBackgroundJobs = startSubscriptionReconciler();
    workers.push(startPayrollDisbursementWorker(), startPresenceExpiryWorker());
  }

  server.listen(PORT, () => {
    const protocol = server instanceof http.Server ? "http" : "https";
    logger.info(`API Gateway running on ${protocol} port ${PORT}`);
    void warmUpDatabase();
  });

  // On SIGTERM (passed on by the cluster primary): drain HTTP, WebSockets
  // and jobs, then close what they used — see config/gracefulShutdown.ts.
  registerGracefulShutdown({
    connections,
    io,
    workers,
    closeWorker,
    stopBackgroundJobs: () => stopBackgroundJobs(),
    closeQueues,
    closeWebSocketRedis: () => redisAdapter.cleanup(),
    closeGrpcClients,
    disconnectDatabases,
    flushTelemetry,
  });
}

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  startServer(
    http2.createSecureServer(
      {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        allowHTTP1: true,
      },
      app as any,
    ),
  );
} else {
  startServer(http.createServer(app));
}
