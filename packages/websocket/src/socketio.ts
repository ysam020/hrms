import type { Server as HttpServer } from "http";
import type { Server as HttpsServer } from "https";
import { Server, type Socket } from "socket.io";
import {
  RedisWebSocketAdapter,
  type AdapterOptions,
} from "./RedisWebSocketAdapter";

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

function authError(
  message: string,
  data: { code: string; retryable: boolean },
): Error {
  return Object.assign(new Error(message), { data });
}

export function configureSocketIO(
  server: HttpServer | HttpsServer,
  allowedOrigins: string | string[],
  verifyToken?: TokenVerifier,
  adapterOptions: AdapterOptions = {},
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
          // A definitive refusal (bad/expired token, or the person may not
          // connect): the client must not retry with this token.
          return next(
            authError("Authentication failed: invalid token", {
              code: "AUTH_REJECTED",
              retryable: false,
            }),
          );
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
    } catch (err) {
      // The verifier could not complete the check (database down /
      // slow / breaker open). Not a refusal — the client keeps its session
      // and reconnects with backoff. Socket.IO sends `data` to the client's
      // connect_error handler.
      const unavailable =
        (err as { name?: string })?.name === "AccountAccessUnavailableError";
      next(
        unavailable
          ? authError("Authentication temporarily unavailable", {
              code: "AUTH_CHECK_UNAVAILABLE",
              retryable: true,
            })
          : authError("Authentication failed", {
              code: "AUTH_FAILED",
              retryable: true,
            }),
      );
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

  const redisAdapter = new RedisWebSocketAdapter(io, adapterOptions);

  return { io, redisAdapter };
}
