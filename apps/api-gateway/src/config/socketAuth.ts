import jwt from "jsonwebtoken";
import type { Server, Socket } from "socket.io";
import { logger } from "@hrms/logger";
import {
  subscribeAccountRevocations,
  type AccountRevocation,
} from "@hrms/cache";
import { isAccountAccessUnavailable } from "@hrms/db";
import type {
  DeliveryAuthorizer,
  RedisWebSocketAdapter,
} from "@hrms/websocket";
import {
  resolveAccountAccess,
  invalidateAccountAccess,
  invalidateTenantAccess,
  flushAccountAccessDecisions,
} from "../services/accountAccess";

/**
 * Inbound events that write data or subscribe to other people's
 * data are authorised against a FRESH account decision (no cache), so a
 * terminated or removed person is refused on the very next attempt even
 * when the change was made outside the application. Keystroke-rate events
 * (typing, heartbeat) keep the cached path.
 */
export const SENSITIVE_SOCKET_EVENTS = new Set([
  "chat:send",
  "chat:join",
  "chat:read",
  "chat:delete-message",
  "chat:pin-message",
  "chat:unpin-message",
  "presence:watch",
]);

/**
 * Upper bound on the age of the account decision used for a TARGETED
 * delivery (chat, notifications). API-initiated revocations take effect
 * immediately (revocation channel); this bounds direct DB edits.
 */
export const DELIVERY_MAX_AGE_MS =
  Number(process.env.SOCKET_DELIVERY_MAX_AGE_MS) || 5_000;

/** Wired into the socket adapter: checked just before every emit. */
export const authorizeSocketDelivery: DeliveryAuthorizer = async (
  userId,
  tenantId,
) => {
  try {
    const access = await resolveAccountAccess(userId, tenantId, {
      maxAgeMs: DELIVERY_MAX_AGE_MS,
    });
    return access.ok ? "allow" : "deny";
  } catch (err) {
    if (isAccountAccessUnavailable(err)) return "unavailable";
    logger.error("socket delivery authorisation failed", { err });
    return "unavailable";
  }
};

/**
 * Subscribes this gateway worker to cluster-wide revocations. On a message
 * it drops the cached decisions, then re-checks (fresh) every local socket
 * the message concerns and closes those no longer allowed — a revocation
 * for one organisation never closes a person's sessions in another one they
 * still belong to. An unavailable check closes the socket (fail closed: a
 * revocation was announced).
 */
export function startAccountRevocationListener(
  adapter: Pick<RedisWebSocketAdapter, "revokeLocal">,
  io: Pick<Server, "sockets">,
): () => Promise<void> {
  const handle = async (r: AccountRevocation) => {
    if (r.userId) invalidateAccountAccess(r.userId);
    else if (r.tenantId) invalidateTenantAccess(r.tenantId);
    const pairs = new Map<
      string,
      { userId: string; tenantId: string | null }
    >();
    for (const sock of io.sockets.sockets.values()) {
      const a = sock as Socket & { userId?: string; tenantId?: string | null };
      if (!a.userId) continue;
      const tenantId = a.tenantId ?? null;
      if (r.userId && a.userId !== r.userId) continue;
      if (
        r.tenantId !== undefined &&
        r.tenantId !== null &&
        tenantId !== r.tenantId
      )
        continue;
      pairs.set(`${a.userId}:${tenantId}`, { userId: a.userId, tenantId });
    }
    let closed = 0;
    await Promise.all(
      [...pairs.values()].map(async ({ userId, tenantId }) => {
        let allowed = false;
        try {
          allowed = (
            await resolveAccountAccess(userId, tenantId, { maxAgeMs: 0 })
          ).ok;
        } catch {
          allowed = false;
        }
        if (!allowed) closed += adapter.revokeLocal(userId, tenantId);
      }),
    );
    if (closed)
      logger.info("account revocation applied", { reason: r.reason, closed });
  };
  return subscribeAccountRevocations(
    (r) => void handle(r),
    () => {
      const flushed = flushAccountAccessDecisions();
      logger.warn("account decisions flushed after revocation resync", {
        flushed,
      });
    },
  );
}

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
    // `fresh` (sensitive events): no cached decision, and an unavailable
    // check refuses the event (fail closed) while keeping the socket open.
    // Every incoming event uses a decision at most DELIVERY_MAX_AGE_MS old
    // (typing indicators included), sensitive ones a fresh decision; the
    // periodic sweep uses the ordinary cache.
    const check = async (
      fresh = false,
      maxAgeMs?: number,
    ): Promise<boolean> => {
      try {
        const access = await resolveAccountAccess(
          userId,
          tenantId,
          maxAgeMs === undefined ? {} : { maxAgeMs },
        );
        if (!access.ok) revoke();
        return access.ok;
      } catch (err) {
        if (fresh) {
          logger.warn(
            "sensitive socket event refused: account check unavailable",
            { err },
          );
          socket.emit("chat:error", {
            message: "Temporarily unavailable, please retry",
          });
          return false;
        }
        logger.warn("socket re-validation failed; keeping socket", { err });
        return true;
      }
    };
    const timer = setInterval(() => void check(), intervalMs);
    timer.unref?.();
    socket.on("disconnect", () => clearInterval(timer));
    socket.use((packet, next) => {
      const event = Array.isArray(packet) ? packet[0] : undefined;
      const fresh = SENSITIVE_SOCKET_EVENTS.has(String(event));
      void check(fresh, fresh ? 0 : DELIVERY_MAX_AGE_MS).then((ok) =>
        ok ? next() : undefined,
      );
    });
  });
}

/**
 * Emits to every socket in a local room whose person is still allowed
 * (decision at most DELIVERY_MAX_AGE_MS old). A denied person's sockets are
 * told "session-expired" and closed; an unavailable check skips them for
 * this event. Used for room broadcasts such as presence updates.
 */
export async function emitToRoomAuthorized(
  io: Pick<Server, "sockets">,
  room: string,
  event: string,
  payload: unknown,
): Promise<number> {
  const ids = io.sockets.adapter.rooms.get(room);
  if (!ids?.size) return 0;
  const groups = new Map<
    string,
    { userId: string; tenantId: string | null; sockets: Socket[] }
  >();
  for (const id of ids) {
    const sock = io.sockets.sockets.get(id) as
      | (Socket & { userId?: string; tenantId?: string | null })
      | undefined;
    if (!sock?.userId) continue;
    const key = `${sock.userId}:${sock.tenantId ?? "-"}`;
    const g = groups.get(key) ?? {
      userId: sock.userId,
      tenantId: sock.tenantId ?? null,
      sockets: [],
    };
    g.sockets.push(sock);
    groups.set(key, g);
  }
  let emitted = 0;
  await Promise.all(
    [...groups.values()].map(async (g) => {
      const decision = await authorizeSocketDelivery(g.userId, g.tenantId);
      for (const sock of g.sockets) {
        if (decision === "allow") {
          sock.emit(event, payload);
          emitted++;
        } else if (decision === "deny") {
          sock.emit("session-expired");
          sock.disconnect(true);
        }
      }
    }),
  );
  return emitted;
}
