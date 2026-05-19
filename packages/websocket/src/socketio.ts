import type { Server as HttpServer } from "http";
import type { Server as HttpsServer } from "https";
import { Server, type Socket } from "socket.io";
import { RedisWebSocketAdapter } from "./RedisWebSocketAdapter";

type AuthenticatedSocket = Socket & {
  userId: string;
  tenantId: string | null;
  dbName: string | null;
};

export type SocketAuthPayload = {
  userId: string;
  tenantId: string | null;
  dbName: string | null;
};

/**
 * Async callback provided by the caller to verify a JWT access token and
 * resolve it to the authenticated user's userId + tenantId + dbName.
 * Returns null when the token is invalid or the user cannot be found.
 */
type TokenVerifier = (token: string) => Promise<SocketAuthPayload | null>;

export function configureSocketIO(
  server: HttpServer | HttpsServer,
  allowedOrigins: string | string[],
  verifyToken?: TokenVerifier,
): { io: Server; redisAdapter: RedisWebSocketAdapter } {
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Response-Format",
        "X-Proto-Type",
      ],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    allowEIO3: true,
  });

  // Auth middleware: clients must supply a valid JWT access token.
  io.use(async (socket, next) => {
    try {
      if (verifyToken) {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) {
          return next(new Error("Authentication failed: token required"));
        }
        const payload = await verifyToken(token);
        if (!payload) {
          return next(new Error("Authentication failed: invalid token"));
        }
        (socket as AuthenticatedSocket).userId = payload.userId;
        (socket as AuthenticatedSocket).tenantId = payload.tenantId;
        (socket as AuthenticatedSocket).dbName = payload.dbName ?? null;
      } else {
        // Fallback for local development when no verifier is provided
        const userId = socket.handshake.auth?.userId as string | undefined;
        if (!userId) {
          return next(new Error("Authentication failed: userId is required"));
        }
        (socket as AuthenticatedSocket).userId = userId;
        (socket as AuthenticatedSocket).dbName = null;
      }
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  const redisAdapter = new RedisWebSocketAdapter(io);

  return { io, redisAdapter };
}
