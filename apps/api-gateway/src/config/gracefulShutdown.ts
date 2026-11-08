import type http from "http";
import type http2 from "http2";
import type { Socket } from "net";
import { processShutdown, type GracefulShutdown } from "@hrms/common";
import { logger } from "@hrms/logger";
import { gatewayShutdownGraceMs } from "./shutdownBudget";

// Graceful shutdown for one gateway worker process.
//
// Under node:cluster the primary (bootstrap.ts, runClusterPrimary) receives
// the container's SIGTERM and passes it to each worker; this runs in each
// worker, in phases (see processShutdown in @hrms/common):
//   drain   — stop accepting connections; let in-flight HTTP requests (and
//             the gRPC calls they make) finish; disconnect WebSockets; stop
//             background timers; let active BullMQ jobs finish
//   cleanup — queues, WebSocket Redis, gRPC channels, database clients —
//             only once requests holding tenant-client leases have ended
//   flush   — telemetry
// Requests still running at the drain deadline are aborted, which ends
// their responses ("close") and so releases their tenant-client leases
// before the database clients are closed.

type AnyServer = http.Server | http2.Http2Server | http2.Http2SecureServer;

/** Leaves time, after forcing connections closed, for their close events. */
const FORCE_MARGIN_MS = 500;

export interface ConnectionTracker {
  /**
   * Stops accepting connections and waits up to `timeoutMs` for in-flight
   * requests to finish, closing idle connections straight away. Rejects
   * after forcing still-open connections closed at the deadline.
   */
  drain(timeoutMs: number): Promise<void>;
}

/**
 * Tracks a server's connections from the moment it starts, so shutdown can
 * tell idle connections (close now) from busy ones (let finish):
 * HTTP/1 sockets by their in-flight request count, HTTP/2 sessions via
 * GOAWAY (session.close lets open streams finish and refuses new ones).
 * Upgraded (WebSocket) sockets are left to Socket.IO's own shutdown.
 */
export function trackConnections(server: AnyServer): ConnectionTracker {
  const sockets = new Set<Socket>();
  const inFlight = new Map<Socket, number>();
  const upgraded = new Set<Socket>();
  const sessions = new Set<http2.ServerHttp2Session>();
  let draining = false;

  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
      inFlight.delete(socket);
      upgraded.delete(socket);
    });
  };
  // A TLS server's request sockets are its TLS sockets ("secureConnection");
  // a plain server's are its "connection" sockets.
  const isTls = typeof (server as any).setSecureContext === "function";
  server.on(isTls ? "secureConnection" : "connection", track);

  server.on("session", (session: http2.ServerHttp2Session) => {
    sessions.add(session);
    session.once("close", () => sessions.delete(session));
    if (draining) session.close();
  });
  server.on("upgrade", (req: http.IncomingMessage) => upgraded.add(req.socket));
  server.on("request", (req: any, res: any) => {
    if (req.stream) return; // HTTP/2: drained per session
    const socket: Socket = req.socket;
    inFlight.set(socket, (inFlight.get(socket) ?? 0) + 1);
    if (draining && !res.headersSent) res.setHeader("Connection", "close");
    res.once("close", () => {
      const left = (inFlight.get(socket) ?? 1) - 1;
      if (left > 0) {
        inFlight.set(socket, left);
        return;
      }
      inFlight.delete(socket);
      if (draining) socket.end();
    });
  });

  // HTTP/2 connections are drained through their session (GOAWAY), never by
  // ending the socket, which would cut their open streams. They are told
  // apart by the protocol TLS negotiated: session.socket is a proxy, not
  // the socket object itself. (Plaintext h2c, which the gateway doesn't
  // serve, can't be told apart this way.)
  const isHttp2 = (socket: Socket) =>
    (socket as Socket & { alpnProtocol?: string | false }).alpnProtocol ===
    "h2";

  return {
    async drain(timeoutMs) {
      draining = true;
      const closed = new Promise<void>((resolve) =>
        server.close(() => resolve()),
      );
      for (const session of sessions) session.close();
      for (const socket of sockets) {
        if (
          !inFlight.get(socket) &&
          !upgraded.has(socket) &&
          !isHttp2(socket)
        ) {
          socket.end();
        }
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<"deadline">((resolve) => {
        timer = setTimeout(
          () => resolve("deadline"),
          Math.max(timeoutMs - FORCE_MARGIN_MS, 0),
        );
        timer.unref?.();
      });
      const outcome = await Promise.race([
        closed.then(() => "closed" as const),
        deadline,
      ]);
      clearTimeout(timer);
      if (outcome === "closed") return;

      const open = sockets.size + sessions.size;
      for (const session of sessions) session.destroy();
      for (const socket of sockets) socket.destroy();
      throw new Error(
        `${open} connection(s) still open after ${timeoutMs - FORCE_MARGIN_MS} ms — aborted`,
      );
    },
  };
}

export interface GatewayShutdownDeps {
  connections: ConnectionTracker;
  /** Socket.IO server: every client is disconnected. */
  io: { disconnectSockets(close?: boolean): void };
  /** BullMQ workers this process runs (worker 1 only). */
  workers: Array<{ close(): Promise<void>; name: string }>;
  closeWorker(
    worker: { close(): Promise<void>; name: string },
    timeoutMs: number,
  ): Promise<void>;
  /** Stops timers that would start new background work. */
  stopBackgroundJobs(): void;
  closeQueues(): Promise<void>;
  closeWebSocketRedis(): Promise<void>;
  closeGrpcClients(): void;
  disconnectDatabases(): Promise<void>;
  flushTelemetry(): Promise<void>;
}

/** Registers the gateway worker's shutdown on the process coordinator. */
export function registerGracefulShutdown(
  deps: GatewayShutdownDeps,
): GracefulShutdown {
  const shutdown = processShutdown("api-gateway", {
    graceMs: gatewayShutdownGraceMs(),
    cleanupReserveMs: 1_500,
    flushReserveMs: 1_000,
  });

  shutdown.onShutdown(
    "background timers",
    async () => deps.stopBackgroundJobs(),
    "drain",
  );
  shutdown.onShutdown(
    "HTTP server",
    (ms) => deps.connections.drain(ms),
    "drain",
  );
  shutdown.onShutdown(
    "Socket.IO",
    async () => deps.io.disconnectSockets(true),
    "drain",
  );
  shutdown.onShutdown(
    "BullMQ workers",
    (ms) => Promise.all(deps.workers.map((w) => deps.closeWorker(w, ms))),
    "drain",
  );

  shutdown.onShutdown("queues", () => deps.closeQueues(), "cleanup");
  shutdown.onShutdown(
    "websocket redis",
    () => deps.closeWebSocketRedis(),
    "cleanup",
  );
  shutdown.onShutdown(
    "gRPC clients",
    async () => deps.closeGrpcClients(),
    "cleanup",
  );
  shutdown.onShutdown(
    "database clients",
    () => deps.disconnectDatabases(),
    "cleanup",
  );

  shutdown.onShutdown("telemetry", () => deps.flushTelemetry(), "flush");

  logger.info("api-gateway: graceful shutdown registered");
  return shutdown;
}
