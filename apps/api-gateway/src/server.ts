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
import { apiRequestLogger, logger } from "@hrms/logger";
import { configureSocketIO } from "@hrms/websocket";
import { setupChatSocket } from "./config/chatSocket";
import { configureSwagger } from "./config/swaggerSetup";
import { generateCsrfToken, doubleCsrfProtection } from "./config/csrf";
import { applyRateLimiters, authLimiter } from "./config/rateLimiters";
import { resolveSocketUserId } from "./config/socketAuth";
import { registerGracefulShutdown } from "./config/gracefulShutdown";
import { rootRouter } from "./routes";
import { auditLogMiddleware } from "./middleware/auditLog";
import { googleAuthCallback, googleCalendarCallback } from "./handlers/auth";
import { handleWebhook } from "./handlers/payment";
import { handleRazorpayXWebhook } from "./handlers/razorpayxWebhook";
import { startSubscriptionReconciler } from "./services/subscriptionReconciler";
import { startPayrollDisbursementWorker } from "./workers/payrollDisbursementWorker";
import { ensureMasterIndexes } from "@hrms/db";

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
app.use(apiRequestLogger);

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
    startSubscriptionReconciler();
    startPayrollDisbursementWorker();
  }

  server.listen(PORT, () => {
    const protocol = server instanceof http.Server ? "http" : "https";
    logger.info(`API Gateway running on ${protocol} port ${PORT}`);
  });

  registerGracefulShutdown(server, redisAdapter);
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
