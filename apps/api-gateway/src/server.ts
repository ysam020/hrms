import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import https from "https";
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

const app = express();
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
app.use(apiRequestLogger);

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

// Stricter limiter for unauthenticated public endpoints (careers, job application)
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

app.use(
  /^\/api\/(webauthn-login|webauthn-verify-login|webauthn-login-options|webauthn-credential-check|auth\/google)/,
  authLimiter,
);
app.use("/api/refresh-token", authLimiter);
app.use(
  /^\/api\/(public\/careers|get-job-titles|apply-for-job)/,
  publicLimiter,
);
app.use("/api", generalLimiter);

app.use(auditLogMiddleware);
configureSwagger(app);
app.use("/api", rootRouter);

app.get("/health", (_req, res) => res.json({ status: "healthy" }));

app.use((error: any, _req: any, res: any, _next: any) => {
  logger.error("Unhandled error:", { error });
  const status = error.status || 500;
  // Never expose internal error details to the client
  const message =
    status < 500 ? error.message || "Bad request" : "Internal Server Error";
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

function startServer(server: http.Server | https.Server) {
  const { io, redisAdapter } = configureSocketIO(
    server,
    allowedOrigins,
    resolveSocketUsername,
  );
  setupChatSocket(io, redisAdapter);

  server.listen(PORT, () => {
    const protocol = server instanceof https.Server ? "https" : "http";
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
    https.createServer(
      { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
      app,
    ),
  );
} else {
  startServer(http.createServer(app));
}
