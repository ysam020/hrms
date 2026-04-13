import http2Express from "http2-express-bridge";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { doubleCsrf } from "csrf-csrf";
import http2 from "http2";
import http from "http";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { apiRequestLogger, logger } from "@hrms/logger";
import { configureSocketIO } from "@hrms/websocket";
import { prisma } from "@hrms/db";
import { setupChatSocket } from "./config/chatSocket";
import { configureSwagger } from "./config/swaggerSetup";
import { rootRouter } from "./routes";
import { auditLogMiddleware } from "./middleware/auditLog";
import {
  authLimiter as routerAuthLimiter,
  makeRedisStore,
  userAwareKeyGenerator,
} from "./middleware/rateLimiter";
import { errorMessage } from "@hrms/common";

const app = http2Express(express);
const PORT = Number(process.env.API_GATEWAY_PORT) || 9002;

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET!,
  getSessionIdentifier: (req) => {
    // Tie the CSRF token to the authenticated user when possible
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      try {
        const payload = jwt.decode(auth.slice(7)) as any;
        if (payload?.userId) return payload.userId as string;
      } catch {}
    }
    return req.ip ?? "";
  },
  cookieName: "csrf-token",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
});

// Trust the first proxy hop so req.ip is correct and rate limiters
// work properly behind a reverse proxy / load balancer.
app.set("trust proxy", 1);

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
  : [];

// Swagger UI requires unsafe-inline for its bundled styles.
// Apply a relaxed CSP only for that route before the global Helmet middleware.
app.use("/api-docs", (req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https: data:;",
  );
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // unsafe-inline removed: this gateway only serves JSON responses and
        // does not need inline styles outside of the /api-docs Swagger UI.
        styleSrc: ["'self'"],
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

// Body parsers — keep limits tight to reduce DoS surface
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─── Rate limiters ────────────────────────────────────────────────────────────
// All limiters key by userId for authenticated requests, IP for anonymous ones.
const authLimiter = routerAuthLimiter;

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userAwareKeyGenerator,
  store: makeRedisStore(60 * 1000, "rl:general:"),
  message: { message: "Too many requests, please try again later" },
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 250,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userAwareKeyGenerator,
  store: makeRedisStore(15 * 60 * 1000, "rl:public:"),
  message: { message: "Too many requests, please try again later" },
});

// ─── API v1 routes ────────────────────────────────────────────────────────────
const API_PREFIX = "/api/v1";

app.use(
  new RegExp(
    `^${API_PREFIX}/(webauthn-login|webauthn-verify-login|webauthn-login-options|webauthn-credential-check|auth/google)`,
  ),
  authLimiter,
);
app.use(`${API_PREFIX}/refresh-token`, authLimiter);
app.use(
  new RegExp(`^${API_PREFIX}/(public/careers|get-job-titles|apply-for-job)`),
  publicLimiter,
);
app.use(API_PREFIX, generalLimiter);

app.use(auditLogMiddleware);
configureSwagger(app as any);
app.get(`${API_PREFIX}/csrf-token`, (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});
app.use(API_PREFIX, rootRouter);

app.get("/health", (_req, res) => res.json({ status: "healthy" }));

app.use((error: any, _req: any, res: any, _next: any) => {
  logger.error("Unhandled error:", { error });
  const status = error.status || 500;
  // Never expose internal error details to the client
  const message =
    status < 500
      ? error.message || "Bad request"
      : errorMessage.GENERAL.INTERNAL_ERROR;
  res.status(status).json({ message });
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

// Verifies a WebSocket JWT access token and resolves it to the user's username.
// Returns null for any invalid/expired token or unknown user.
async function resolveSocketUsername(token: string): Promise<string | null> {
  try {
    const payload = jwt.verify(token, process.env.ACCESS_JWT_TOKEN!, {
      algorithms: ["HS256"],
    }) as any;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { username: true },
    });
    return user?.username ?? null;
  } catch {
    return null;
  }
}

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

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("API Gateway shutting down...");
    await redisAdapter.cleanup();
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
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
