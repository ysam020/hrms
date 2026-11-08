import type { Server as SocketServer, Socket } from "socket.io";
import { logger, websocketPublishFailuresTotal } from "@hrms/logger";
import {
  getWebSocketRedis,
  closeWebSocketRedisConnections,
} from "./connection";
import {
  HEARTBEAT_MS,
  SWEEP_MS,
  addMembership,
  removeMembership,
  heartbeat,
  sweepDeadNodes,
  publishToNodes,
  newNodeId,
  nodeChannel,
  nodeUsersKey,
  aliveKey,
  NODES_KEY,
  userRoom,
  type NodeMessage,
} from "./SocketRegistry";

const SERVICE_LABEL = process.env.SERVICE_NAME || "api-gateway";
/** Pre-v2 per-PID channel + single-entry hash (kept one release, §rollout). */
const LEGACY_HASH = "user:sockets";
const legacyChannel = () => `socket:worker-${process.pid}`;

type AuthenticatedSocket = Socket & {
  userId: string;
  tenantId?: string | null;
};

/**
 * Decides, at the moment of delivery, whether this person may still receive
 * targeted events in this tenant. "unavailable" (the check could not run) is
 * treated as deny-for-this-message (fail closed) without disconnecting.
 */
export type DeliveryAuthorizer = (
  userId: string,
  tenantId: string | null,
) => Promise<"allow" | "deny" | "unavailable">;

export interface AdapterOptions {
  authorizeDelivery?: DeliveryAuthorizer;
}

/**
 * Multi-socket, multi-process delivery.
 *
 * - Every socket joins a LOCAL room per (tenant, user) — all of a user's
 *   tabs/devices on this process receive each event exactly once.
 * - Redis tracks which PROCESSES hold sockets for a (tenant, user)
 *   (SocketRegistry). A message is published once per such process; each
 *   process emits once to its local room ⇒ no duplicates.
 * - Disconnecting one socket only deregisters the process when its LAST
 *   socket for that (tenant, user) leaves.
 * - Crashes: liveness key + sweeper + lazy pruning on send; after a Redis
 *   outage the process re-registers every local room (resync).
 * - Every targeted delivery is authorised on the receiving process just
 *   before emit (authorizeDelivery); a denied person's local sockets are
 *   told "session-expired" and closed.
 */
export class RedisWebSocketAdapter {
  private io: SocketServer;
  readonly nodeId = newNodeId();
  private authorizeDelivery?: DeliveryAuthorizer;
  private timers: ReturnType<typeof setInterval>[] = [];
  private closed = false;

  constructor(io: SocketServer, options: AdapterOptions = {}) {
    this.io = io;
    this.authorizeDelivery = options.authorizeDelivery;
    this.setupSubscriber();
    this.setupSocketHandlers();
    this.startHousekeeping();
  }

  // ── Redis wiring ───────────────────────────────────────────────────────
  private setupSubscriber(): void {
    const subscriber = getWebSocketRedis("subscriber");
    subscriber
      .subscribe(
        nodeChannel(this.nodeId),
        legacyChannel(),
        "socket:broadcast",
        "socket:notification",
      )
      .catch((err) =>
        logger.error(`Worker ${process.pid} - Redis subscribe error:`, { err }),
      );

    subscriber.on("message", async (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);
        if (channel === nodeChannel(this.nodeId)) {
          const m = data as NodeMessage;
          await this.deliverLocal(m.tenantId, m.userId, m.eventName, m.payload);
        } else if (channel === legacyChannel()) {
          await this.deliverLegacy(data);
        } else if (channel === "socket:broadcast") {
          await this.emitToAuthorizedSockets(data.eventName, data.payload);
        } else if (channel === "socket:notification") {
          await this.emitToAuthorizedSockets("notification", data.notification);
        }
      } catch (err) {
        logger.error("Error processing Redis pub/sub message:", { err });
      }
    });

    // After any reconnect, re-assert this process's registrations: they may
    // have been swept while the process could not reach Redis.
    const client = getWebSocketRedis("client");
    let connectedBefore = false;
    client.on("ready", () => {
      if (connectedBefore) void this.resync("redis-reconnect");
      connectedBefore = true;
    });
  }

  private startHousekeeping(): void {
    const client = getWebSocketRedis("client");
    const beat = () =>
      heartbeat(client, this.nodeId).catch((err) =>
        logger.warn("socket registry heartbeat failed", { err }),
      );
    void beat();
    // Full re-assertion every few beats heals any race with a sweeper.
    let beats = 0;
    this.timers.push(
      setInterval(() => {
        void beat();
        if (++beats % 6 === 0) void this.resync("periodic");
      }, HEARTBEAT_MS),
    );
    const jitter = Math.floor(Math.random() * Math.min(5_000, SWEEP_MS));
    this.timers.push(
      setInterval(() => {
        sweepDeadNodes(client, this.nodeId)
          .then((r) => {
            if (r.sweptNodes)
              logger.info("socket registry: swept dead gateway nodes", r);
          })
          .catch((err) => logger.warn("socket registry sweep failed", { err }));
      }, SWEEP_MS + jitter),
    );
    for (const t of this.timers) t.unref?.();
  }

  /**
   * Reconciles this process's registrations with its live sockets: adds
   * every (tenant, user) that has a socket here, and removes registrations
   * left behind when a last socket disconnected while Redis was unreachable
   * (otherwise sends would keep reaching this process for nobody).
   */
  async resync(reason: string): Promise<number> {
    const client = getWebSocketRedis("client");
    const pairs = this.localPairs();
    await heartbeat(client, this.nodeId);
    await Promise.all(
      pairs.map(({ tenantId, userId }) =>
        addMembership(client, this.nodeId, tenantId, userId),
      ),
    );
    const registered = await client.smembers(nodeUsersKey(this.nodeId));
    let removed = 0;
    for (const pair of registered) {
      const sep = pair.indexOf(":");
      const tenant = pair.slice(0, sep);
      const userId = pair.slice(sep + 1);
      const tenantId = tenant === "-" ? null : tenant;
      // Re-checked at removal time: a socket that connected meanwhile has
      // already joined its room (synchronously, before registering).
      if (this.localRoomSize(userRoom(tenantId, userId)) > 0) continue;
      await removeMembership(client, this.nodeId, tenantId, userId);
      removed++;
    }
    if (pairs.length || removed)
      logger.info("socket registry resynced", {
        reason,
        pairs: pairs.length,
        removedStale: removed,
      });
    return pairs.length;
  }

  private localPairs(): Array<{ tenantId: string | null; userId: string }> {
    const seen = new Map<string, { tenantId: string | null; userId: string }>();
    for (const s of this.io.sockets.sockets.values()) {
      const a = s as AuthenticatedSocket;
      if (!a.userId) continue;
      const key = userRoom(a.tenantId ?? null, a.userId);
      if (!seen.has(key))
        seen.set(key, { tenantId: a.tenantId ?? null, userId: a.userId });
    }
    return [...seen.values()];
  }

  private localRoomSize(room: string): number {
    return this.io.sockets.adapter.rooms.get(room)?.size ?? 0;
  }

  // ── Socket lifecycle ───────────────────────────────────────────────────
  private setupSocketHandlers(): void {
    this.io.on("connection", (socket) => {
      const { userId } = socket as AuthenticatedSocket;
      if (!userId) return;
      const tenantId = (socket as AuthenticatedSocket).tenantId ?? null;
      const room = userRoom(tenantId, userId);
      const client = getWebSocketRedis("client");

      socket.join(room);
      addMembership(client, this.nodeId, tenantId, userId).catch((err) =>
        logger.error("socket registry: register failed (resync will retry)", {
          err,
        }),
      );
      // Legacy single-entry hash so pre-v2 publishers still find this
      // process during a rolling deploy.
      client
        .hset(LEGACY_HASH, userId, `${process.pid}:${socket.id}`)
        .catch(() => undefined);

      socket.on("disconnect", async () => {
        // Socket.IO has already removed the socket from its rooms.
        if (this.localRoomSize(room) > 0) return; // other tabs remain
        try {
          await removeMembership(client, this.nodeId, tenantId, userId);
          const legacy = await client.hget(LEGACY_HASH, userId);
          if (legacy === `${process.pid}:${socket.id}`) {
            await client.hdel(LEGACY_HASH, userId);
          }
        } catch (err) {
          logger.error(`Worker ${process.pid} - deregister error:`, { err });
        }
      });

      socket.on("error", (err) => {
        logger.error(`Socket error for user ${userId}:`, { err });
      });
    });
  }

  // ── Delivery ───────────────────────────────────────────────────────────
  private async authorize(
    userId: string,
    tenantId: string | null,
  ): Promise<boolean> {
    if (!this.authorizeDelivery) return true;
    let decision: "allow" | "deny" | "unavailable";
    try {
      decision = await this.authorizeDelivery(userId, tenantId);
    } catch {
      decision = "unavailable";
    }
    if (decision === "deny") this.revokeLocal(userId, tenantId);
    return decision === "allow";
  }

  /** Emits to this process's sockets for the pair, after authorisation. */
  async deliverLocal(
    tenantId: string | null,
    userId: string,
    eventName: string,
    payload: unknown,
  ): Promise<boolean> {
    const room = userRoom(tenantId, userId);
    if (this.localRoomSize(room) === 0) return false;
    if (!(await this.authorize(userId, tenantId))) return false;
    this.io.to(room).emit(eventName, payload);
    return true;
  }

  /** Pre-v2 message (no tenant): deliver to this user's local rooms. */
  private async deliverLegacy(data: {
    userId: string;
    eventName: string;
    payload: unknown;
  }): Promise<void> {
    const tenants = new Set<string | null>();
    for (const s of this.io.sockets.sockets.values()) {
      const a = s as AuthenticatedSocket;
      if (a.userId === data.userId) tenants.add(a.tenantId ?? null);
    }
    for (const tenantId of tenants) {
      await this.deliverLocal(
        tenantId,
        data.userId,
        data.eventName,
        data.payload,
      );
    }
  }

  /** Broadcast / platform notification: every socket whose person is allowed. */
  private async emitToAuthorizedSockets(
    eventName: string,
    payload: unknown,
  ): Promise<void> {
    for (const { tenantId, userId } of this.localPairs()) {
      if (await this.authorize(userId, tenantId)) {
        this.io.to(userRoom(tenantId, userId)).emit(eventName, payload);
      }
    }
  }

  /**
   * Send an event to every socket of `userId` in `tenantId`, on every
   * gateway process. Resolves true only if at least one process actually
   * received it (or it was delivered locally).
   */
  async sendToUser(
    userId: string,
    eventName: string,
    payload: unknown,
    options: { tenantId: string | null },
  ): Promise<boolean> {
    const tenantId = options.tenantId ?? null;
    let delivered = false;
    // Local first: works even while Redis is unreachable.
    if (this.localRoomSize(userRoom(tenantId, userId)) > 0) {
      delivered = await this.deliverLocal(tenantId, userId, eventName, payload);
    }
    try {
      const reached = await publishToNodes(
        getWebSocketRedis("client"),
        getWebSocketRedis("publisher"),
        tenantId,
        userId,
        eventName,
        payload,
        this.nodeId,
      );
      return delivered || reached > 0;
    } catch (err) {
      websocketPublishFailuresTotal.inc({
        method: "sendToUser",
        service: SERVICE_LABEL,
      });
      logger.error(`[sendToUser] publish failed for ${userId}:`, { err });
      return delivered;
    }
  }

  // ── Revocation ─────────────────────────────────────────────────────────
  /**
   * Closes this process's sockets for a person (one tenant, or every tenant
   * when tenantId is undefined) or for a whole tenant (userId undefined).
   * Returns how many sockets were closed.
   */
  revokeLocal(
    userId: string | undefined,
    tenantId: string | null | undefined,
  ): number {
    let closed = 0;
    for (const s of [...this.io.sockets.sockets.values()]) {
      const a = s as AuthenticatedSocket;
      const userMatch = userId === undefined || a.userId === userId;
      const tenantMatch =
        tenantId === undefined || (a.tenantId ?? null) === tenantId;
      if (userMatch && tenantMatch && a.userId) {
        s.emit("session-expired");
        s.disconnect(true);
        closed++;
      }
    }
    return closed;
  }

  /** Broadcast an event to every connected socket across all workers. */
  async broadcast(eventName: string, payload: unknown): Promise<void> {
    const publisher = getWebSocketRedis("publisher");
    try {
      await publisher.publish(
        "socket:broadcast",
        JSON.stringify({ eventName, payload }),
      );
    } catch (err) {
      websocketPublishFailuresTotal.inc({
        method: "broadcast",
        service: SERVICE_LABEL,
      });
      logger.error("[broadcast] publish failed:", { err });
    }
  }

  /** Publish a notification to all workers which emit it to all their sockets. */
  async sendNotification(notification: unknown): Promise<void> {
    const publisher = getWebSocketRedis("publisher");
    try {
      await publisher.publish(
        "socket:notification",
        JSON.stringify({ notification }),
      );
    } catch (err) {
      websocketPublishFailuresTotal.inc({
        method: "sendNotification",
        service: SERVICE_LABEL,
      });
      logger.error("[sendNotification] publish failed:", { err });
    }
  }

  /** Graceful shutdown: deregister this process, then close connections. */
  async cleanup(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const t of this.timers) clearInterval(t);
    try {
      const client = getWebSocketRedis("client");
      await Promise.all(
        this.localPairs().map(({ tenantId, userId }) =>
          removeMembership(client, this.nodeId, tenantId, userId),
        ),
      );
      await client
        .pipeline()
        .del(nodeUsersKey(this.nodeId))
        .del(aliveKey(this.nodeId))
        .srem(NODES_KEY, this.nodeId)
        .exec();
    } catch (err) {
      logger.warn("socket registry: deregister on shutdown failed", { err });
    }
    await closeWebSocketRedisConnections();
  }
}
