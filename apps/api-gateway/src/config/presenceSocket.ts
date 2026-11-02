import type { Server as SocketServer, Socket } from "socket.io";
import {
  prismaWithTenant as prisma,
  runWithTenant,
  getClientForDb,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { getWebSocketRedis } from "@hrms/websocket";
import {
  broadcast,
  markLastActive,
  resolveViewer,
  viewsFor,
  visiblePeople,
} from "../services/presence";
import {
  PRESENCE_CHANNEL,
  announceIfChanged,
  dropConnection,
  readConnectivity,
  roomFor,
  touchConnection,
  type ConnectionState,
} from "../services/presenceConnectivity";

type AuthenticatedSocket = Socket & {
  userId: string;
  tenantId: string | null;
  dbName: string | null;
};

/** A closed tab or a dropped network gets this long before "offline". */
export const OFFLINE_GRACE_MS = 30_000;
const MIN_BEAT_MS = 5_000;
const WATCHES_PER_MINUTE = 30;

// Presence over the gateway's socket (docs/presence.md).
//
// Client → server
//   presence:heartbeat { state: "active" | "idle" }   every ~25 s and on change
//   presence:watch     { userIds: string[] }, ack → { ok, presence: [...] }
//
// Server → client
//   presence:update    PresenceView (services/presence.ts)
//
// A socket's tenant and user come from its verified token. Watching joins
// one room per person, named with that tenant, and only for people the
// watcher may see — so an id from another organisation, or a colleague
// outside the watcher's teams, never produces a room and never an event.
// Rooms are per process; every worker receives each event over Redis and
// emits it to its own sockets in that room.
export function setupPresenceSocket(io: SocketServer): void {
  const subscriber = getWebSocketRedis("subscriber");
  subscriber
    .subscribe(PRESENCE_CHANNEL)
    .catch((err) => logger.error("presence: subscribe failed", { err }));
  subscriber.on("message", (channel: string, message: string) => {
    if (channel !== PRESENCE_CHANNEL) return;
    try {
      const { room, payload } = JSON.parse(message);
      if (typeof room === "string" && room.startsWith("px:"))
        io.to(room).emit("presence:update", payload);
    } catch (err) {
      logger.error("presence: bad event", { err });
    }
  });

  io.on("connection", (raw) => {
    const socket = raw as AuthenticatedSocket;
    const { userId, tenantId } = socket;
    if (!tenantId || !userId) return;
    const tenantClient = socket.dbName ? getClientForDb(socket.dbName) : null;
    // Socket handlers get no request context; without this, tenant models
    // would resolve to the wrong database (see chatSocket.ts).
    const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
      runWithTenant(tenantId, tenantClient, fn);

    const selfRoom = roomFor(tenantId, userId);
    // The person's other tabs and devices follow their own changes.
    socket.join(selfRoom);
    let watching = new Set<string>();
    let state: ConnectionState = "active";
    let lastBeat = 0;
    let watchWindow = { start: Date.now(), count: 0 };

    const announce = async () => {
      const now = (await readConnectivity(tenantId, [userId])).get(userId)!;
      if (!(await announceIfChanged(tenantId, userId, now))) return;
      await withTenant(async () => {
        if (now === "offline")
          await markLastActive(tenantId, userId, new Date());
        await broadcast(tenantId, userId);
      });
    };
    const beat = (next: ConnectionState) => {
      state = next;
      lastBeat = Date.now();
      touchConnection(tenantId, userId, socket.id, state)
        .then(announce)
        .catch((err) => logger.warn("presence: heartbeat failed", { err }));
    };
    beat("active");

    socket.on("presence:heartbeat", (data: unknown) => {
      const next: ConnectionState =
        (data as { state?: unknown })?.state === "idle" ? "idle" : "active";
      if (next === state && Date.now() - lastBeat < MIN_BEAT_MS) return;
      beat(next);
    });

    socket.on("presence:watch", async (data: unknown, ack?: unknown) => {
      const reply = typeof ack === "function" ? ack : () => undefined;
      const now = Date.now();
      if (now - watchWindow.start > 60_000)
        watchWindow = { start: now, count: 0 };
      if (++watchWindow.count > WATCHES_PER_MINUTE)
        return reply({ ok: false, error: "rate_limited" });
      try {
        const ids = (data as { userIds?: unknown })?.userIds;
        const views = await withTenant(async () => {
          const membership = await prisma.tenantMembership.findFirst({
            where: { tenantId, userId },
            select: { role: true },
          });
          const viewer = await resolveViewer(
            tenantId,
            userId,
            membership?.role,
          );
          const people = await visiblePeople(
            viewer,
            Array.isArray(ids) ? ids : [],
          );
          return viewsFor(tenantId, people);
        });
        const rooms = new Set(
          [...views.keys()].map((id) => roomFor(tenantId, id)),
        );
        for (const r of watching)
          if (!rooms.has(r) && r !== selfRoom) void socket.leave(r);
        for (const r of rooms) void socket.join(r);
        watching = rooms;
        reply({ ok: true, presence: [...views.values()] });
      } catch (err) {
        logger.error("presence:watch failed", { err, userId });
        reply({ ok: false });
      }
    });

    socket.on("disconnect", () => {
      dropConnection(tenantId, userId, socket.id)
        .then(() => {
          // A refresh or a brief network drop reconnects well within this;
          // the check then finds the person still online and stays quiet.
          const timer = setTimeout(() => {
            announce().catch((err) =>
              logger.warn("presence: offline check failed", { err }),
            );
          }, OFFLINE_GRACE_MS);
          timer.unref?.();
        })
        .catch((err) => logger.warn("presence: disconnect failed", { err }));
    });
  });
}
