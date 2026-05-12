import http2Express from "http2-express-bridge";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import http2 from "http2";
import http from "http";
import fs from "fs";
import path from "path";
import { apiRequestLogger, logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { configureSocketIO } from "@hrms/websocket";
import { setupChatSocket } from "./config/chatSocket";
import { configureSwagger } from "./config/swaggerSetup";
import { generateCsrfToken, doubleCsrfProtection } from "./config/csrf";
import { applyRateLimiters, authLimiter } from "./config/rateLimiters";
import { resolveSocketUsername } from "./config/socketAuth";
import { registerGracefulShutdown } from "./config/gracefulShutdown";
import { rootRouter } from "./routes";
import { auditLogMiddleware } from "./middleware/auditLog";
import { googleAuthCallback } from "./handlers/auth";

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
app.use("/api/v1", rootRouter);

app.get("/health", (_req, res) => res.json({ status: "healthy" }));

app.use((error: any, _req: any, res: any, _next: any) => {
  logger.error("Unhandled error:", { error });
  const httpStatus = error.status || 500;
  const message =
    httpStatus < 500 ? error.message || "Bad request" : "Internal Server Error";
  const status =
    httpStatus < 500
      ? RESPONSE_STATUS.BAD_REQUEST
      : RESPONSE_STATUS.INTERNAL_SERVER_ERROR;
  return apiResponse(res, status, { message });
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
    resolveSocketUsername,
  );
  setupChatSocket(io, redisAdapter);

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
