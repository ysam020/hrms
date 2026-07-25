import type { Server as HttpServer } from "http";
import type { Server as HttpsServer } from "https";
import { Server, type Socket } from "socket.io";
import { RedisWebSocketAdapter } from "./RedisWebSocketAdapter";

type AuthenticatedSocket = Socket & {
  userId: string;
  tenantId: string | null;
  dbName: string | null;
  exp?: number;
};

export type SocketAuthPayload = {
  userId: string;
  tenantId: string | null;
  dbName: string | null;
  // Unix seconds. When present, the connection is force-disconnected at
  // this instant instead of staying open indefinitely — see the
  // "connection" handler below for why.
  exp?: number;
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
        (socket as AuthenticatedSocket).exp = payload.exp;
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

  // HTTP re-verifies the JWT on every request, so an expired token is
  // rejected immediately; a WebSocket only ever gets verified once, at
  // handshake, and would otherwise stay open — and keep receiving/sending
  // events — indefinitely past the token's expiry. Bound that window to the
  // token's actual lifetime instead of never.
  io.on("connection", (socket) => {
    const exp = (socket as AuthenticatedSocket).exp;
    if (!exp) return;
    const msUntilExpiry = exp * 1000 - Date.now();
    if (msUntilExpiry <= 0) {
      socket.disconnect(true);
      return;
    }
    const timer = setTimeout(() => {
      socket.emit("session-expired");
      socket.disconnect(true);
    }, msUntilExpiry);
    timer.unref?.();
    socket.on("disconnect", () => clearTimeout(timer));
  });

  const redisAdapter = new RedisWebSocketAdapter(io);

  return { io, redisAdapter };
}
