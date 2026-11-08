import jwt from "jsonwebtoken";
import type { Server, Socket } from "socket.io";
import { logger } from "@hrms/logger";
import { resolveAccountAccess } from "../services/accountAccess";

export interface SocketAuthPayload {
  userId: string;
  tenantId: string | null;
  dbName: string | null;
  // Unix seconds — lets configureSocketIO schedule a disconnect at the
  // token's actual expiry instead of trusting the handshake-time check
  // forever. HTTP re-verifies the JWT on every request; a socket otherwise
  // only ever gets checked once, at connect.
  exp?: number;
}

// Verifies a WebSocket JWT access token and returns userId + tenantId + dbName.
// Returns null for an invalid/expired token or a person who may not connect
// (terminated, removed, organisation inactive). THROWS
// AccountAccessUnavailableError when the account check could not be
// completed — the handshake then tells the client to retry later
// instead of treating it as a rejection.
export async function resolveSocketUserId(
  token: string,
): Promise<SocketAuthPayload | null> {
  let payload: any;
  try {
    payload = jwt.verify(token, process.env.ACCESS_JWT_TOKEN!, {
      algorithms: ["HS256"],
    });
  } catch {
    return null;
  }
  if (!payload?.userId) return null;
  // A signed token isn't enough — the person must still be
  // allowed in (employment status, membership, organisation active).
  const access = await resolveAccountAccess(
    payload.userId,
    payload.tenantId ?? null,
  );
  if (!access.ok) return null;
  return {
    userId: payload.userId,
    tenantId: payload.tenantId ?? null,
    dbName: payload.dbName ?? null,
    exp: typeof payload.exp === "number" ? payload.exp : undefined,
  };
}

/**
 * A socket outlives the request that opened it (until the access
 * token's `exp`, up to 24 h) and keeps RECEIVING pushes — chat, presence,
 * notifications — even when the person sends nothing. So connected sockets
 * are re-validated against the same authoritative account check:
 *   - every SOCKET_REVALIDATE_MS (default 60 s), and
 *   - on each incoming event (served from the 30 s cache, so cheap).
 * A socket whose person was terminated, removed from the organisation, or
 * whose organisation was deactivated gets "session-expired" and is closed.
 *
 * A database error during re-validation leaves the socket open (logged): the
 * next interval retries, and the HTTP layer still refuses the person.
 */
export function enforceSocketAccess(
  io: Pick<Server, "on">,
  intervalMs = Number(process.env.SOCKET_REVALIDATE_MS) || 60_000,
): void {
  io.on("connection", (socket: Socket) => {
    const s = socket as Socket & { userId?: string; tenantId?: string | null };
    if (!s.userId) return;
    const userId = s.userId;
    const tenantId = s.tenantId ?? null;
    let closed = false;
    const revoke = () => {
      if (closed) return;
      closed = true;
      socket.emit("session-expired");
      socket.disconnect(true);
    };
    const check = async (): Promise<boolean> => {
      try {
        const access = await resolveAccountAccess(userId, tenantId);
        if (!access.ok) revoke();
        return access.ok;
      } catch (err) {
        logger.warn("socket re-validation failed; keeping socket", { err });
        return true;
      }
    };
    const timer = setInterval(() => void check(), intervalMs);
    timer.unref?.();
    socket.on("disconnect", () => clearInterval(timer));
    socket.use((_packet, next) => {
      void check().then((ok) => (ok ? next() : undefined));
    });
  });
}
