/**
 * Gateway worker shutdown.
 *
 * The connection-draining tests run real servers on loopback: plain HTTP
 * (keep-alive and in-flight requests) and HTTP/2 through the gateway's
 * actual http2-express-bridge, with the real request-lease middleware —
 * proving the bridge's responses emit the "finish"/"close" events that
 * release tenant-client leases. Nothing leaves the machine.
 */
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import http from "http";
import http2 from "http2";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import type { AddressInfo } from "net";
import express from "express";
import http2Express from "http2-express-bridge";
import { activeLeases } from "@hrms/db";
import {
  resetProcessShutdownForTests,
  type GracefulShutdown,
} from "@hrms/common";
import {
  registerGracefulShutdown,
  trackConnections,
  type GatewayShutdownDeps,
} from "../config/gracefulShutdown";
import { leaseForRequest } from "../middleware/leaseForRequest";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const port = (s: { address(): any }) => (s.address() as AddressInfo).port;
const listen = (s: http.Server | http2.Http2Server) =>
  new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));

describe("trackConnections — HTTP/1 (real server)", () => {
  let server: http.Server;
  let agent: http.Agent;
  afterEach(() => {
    agent?.destroy();
    server?.closeAllConnections?.();
    server?.close();
  });

  const get = (path: string) =>
    new Promise<{ status?: number; error?: string }>((resolve) => {
      http
        .get({ host: "127.0.0.1", port: port(server), path, agent }, (res) => {
          res.resume();
          res.on("end", () => resolve({ status: res.statusCode }));
        })
        .on("error", (e: any) => resolve({ error: e.code ?? e.message }));
    });

  it("stops accepting connections, and closes idle keep-alive connections straight away", async () => {
    server = http.createServer((_req, res) => res.end("ok"));
    const tracker = trackConnections(server);
    await listen(server);
    agent = new http.Agent({ keepAlive: true });
    expect((await get("/")).status).toBe(200); // leaves an idle keep-alive socket
    const p = port(server);

    const started = Date.now();
    await tracker.drain(5_000);
    expect(Date.now() - started).toBeLessThan(1_000); // didn't wait for the deadline

    const refused = await new Promise<string>((resolve) =>
      http
        .get({ host: "127.0.0.1", port: p, path: "/", agent: false }, () =>
          resolve("answered"),
        )
        .on("error", (e: any) => resolve(e.code)),
    );
    expect(refused).toBe("ECONNREFUSED");
  });

  it("lets an in-flight request finish within the deadline, then releases its tenant-client lease", async () => {
    const client = { tenant: "a" };
    server = http.createServer((req, res) => {
      leaseForRequest(res as any, client);
      setTimeout(() => res.end("done"), 300);
    });
    const tracker = trackConnections(server);
    await listen(server);
    agent = new http.Agent({ keepAlive: true });

    const request = get("/slow");
    await wait(50);
    expect(activeLeases(client)).toBe(1);
    await tracker.drain(5_000);

    expect((await request).status).toBe(200);
    expect(activeLeases(client)).toBe(0);
  });

  it("aborts a request that outlasts the deadline, releases its lease, and reports the drain as failed", async () => {
    const client = { tenant: "b" };
    server = http.createServer((_req, res) => {
      leaseForRequest(res as any, client);
      // never responds
    });
    const tracker = trackConnections(server);
    await listen(server);
    agent = new http.Agent({ keepAlive: true });

    const request = get("/hangs");
    await wait(50);
    await expect(tracker.drain(1_000)).rejects.toThrow(
      /connection\(s\) still open after 500 ms — aborted/,
    );
    expect((await request).error).toBeDefined();
    await wait(20);
    expect(activeLeases(client)).toBe(0);
  });
});

// The bridge applies its HTTP/2 request/response prototypes only when TLS
// negotiated "h2" (ALPN) — as in production (http2.createSecureServer with
// allowHTTP1) — so these tests serve HTTP/2 over TLS with a throwaway
// self-signed certificate.
describe("trackConnections — HTTP/2 over TLS through http2-express-bridge (real server)", () => {
  let server: http2.Http2SecureServer;
  let session: http2.ClientHttp2Session | undefined;
  let tls: { key: Buffer; cert: Buffer };

  beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-shutdown-"));
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        path.join(dir, "key.pem"),
        "-out",
        path.join(dir, "cert.pem"),
        "-subj",
        "/CN=localhost",
        "-days",
        "1",
      ],
      { stdio: "ignore" },
    );
    tls = {
      key: fs.readFileSync(path.join(dir, "key.pem")),
      cert: fs.readFileSync(path.join(dir, "cert.pem")),
    };
    fs.rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => {
    session?.destroy();
    server?.close();
  });

  const start = async (handler: express.RequestHandler, client: object) => {
    const app = http2Express(express);
    app.use((_req: any, res: any, next: any) => {
      leaseForRequest(res, client);
      next();
    });
    app.get("/x", handler);
    server = http2.createSecureServer({ ...tls, allowHTTP1: true }, app as any);
    const tracker = trackConnections(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    session = http2.connect(`https://localhost:${port(server)}`, {
      ca: tls.cert,
      checkServerIdentity: () => undefined,
    });
    session.on("error", () => undefined);
    return tracker;
  };

  const request = (p: string) =>
    new Promise<{ status?: number; error?: string }>((resolve) => {
      const stream = session!.request({ ":path": p });
      let status: number | undefined;
      stream.on("response", (h) => (status = Number(h[":status"])));
      stream.on("data", () => undefined);
      stream.on("end", () => resolve({ status }));
      stream.on("error", (e: any) => resolve({ error: e.code ?? e.message }));
      stream.on("close", () => resolve({ status }));
      stream.end();
    });

  it("releases the lease on a completed bridged response ('finish' fires)", async () => {
    const client = { tenant: "h2-ok" };
    await start((_req, res) => void res.send("ok"), client);

    expect((await request("/x")).status).toBe(200);
    await wait(20);
    expect(activeLeases(client)).toBe(0);
  });

  it("lets an in-flight stream finish after GOAWAY, then the drain completes", async () => {
    const client = { tenant: "h2-slow" };
    const tracker = await start(
      (_req, res) => void setTimeout(() => res.send("done"), 300),
      client,
    );

    const inFlight = request("/x");
    await wait(100);
    expect(activeLeases(client)).toBe(1);
    await tracker.drain(5_000);
    expect((await inFlight).status).toBe(200);
    expect(activeLeases(client)).toBe(0);
  });

  it("releases the lease of a bridged response aborted at the deadline ('close' fires)", async () => {
    const client = { tenant: "h2-hung" };
    const tracker = await start(() => undefined, client);

    const hung = request("/x");
    await wait(100);
    expect(activeLeases(client)).toBe(1);
    await expect(tracker.drain(1_000)).rejects.toThrow(/aborted/);
    await hung;
    await wait(20);
    expect(activeLeases(client)).toBe(0);
  });
});

describe("registerGracefulShutdown", () => {
  let handlers: Record<string, () => void>;
  let on: jest.SpyInstance;
  let exit: jest.SpyInstance;
  let order: string[];

  const deps = (
    overrides: Partial<GatewayShutdownDeps> = {},
  ): GatewayShutdownDeps => ({
    connections: {
      drain: jest.fn(async () => void order.push("http drained")),
    },
    io: { disconnectSockets: jest.fn(() => void order.push("sockets closed")) },
    workers: [
      { name: "payrollDisbursementQueue", close: jest.fn() },
      { name: "presenceQueue", close: jest.fn() },
    ],
    closeWorker: jest.fn(async (w) => void order.push(`worker ${w.name}`)),
    stopBackgroundJobs: jest.fn(() => void order.push("timers stopped")),
    closeQueues: jest.fn(async () => void order.push("queues")),
    closeWebSocketRedis: jest.fn(async () => void order.push("ws redis")),
    closeGrpcClients: jest.fn(() => void order.push("grpc clients")),
    disconnectDatabases: jest.fn(async () => void order.push("databases")),
    flushTelemetry: jest.fn(async () => void order.push("telemetry")),
    ...overrides,
  });

  beforeEach(() => {
    resetProcessShutdownForTests();
    handlers = {};
    order = [];
    on = jest.spyOn(process, "on").mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      handlers[event] = handler;
      return process;
    }) as any);
    exit = jest.spyOn(process, "exit").mockImplementation((() => {}) as any);
  });
  afterEach(() => {
    on.mockRestore();
    exit.mockRestore();
    resetProcessShutdownForTests();
    delete process.env.SHUTDOWN_GRACE_MS;
  });

  const run = (g: GracefulShutdown, signal = "SIGTERM") => g.shutdown(signal);

  it("installs SIGTERM and SIGINT handlers", () => {
    registerGracefulShutdown(deps());
    expect(Object.keys(handlers).sort()).toEqual(["SIGINT", "SIGTERM"]);
  });

  it("drains HTTP, WebSockets, timers and jobs first; then closes queues, Redis, gRPC and databases; telemetry last; exits 0", async () => {
    const g = registerGracefulShutdown(deps());
    await run(g);

    const drained = order.slice(0, 5).sort();
    expect(drained).toEqual(
      [
        "http drained",
        "sockets closed",
        "timers stopped",
        "worker payrollDisbursementQueue",
        "worker presenceQueue",
      ].sort(),
    );
    expect(order.slice(5, 9).sort()).toEqual(
      ["databases", "grpc clients", "queues", "ws redis"].sort(),
    );
    expect(order[9]).toBe("telemetry");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("keeps database clients open until slow requests have finished draining", async () => {
    let finishHttp!: () => void;
    const g = registerGracefulShutdown(
      deps({
        connections: {
          drain: () =>
            new Promise<void>((r) => {
              finishHttp = () => {
                order.push("http drained");
                r();
              };
            }),
        },
      }),
    );
    const done = run(g);
    await wait(20);
    expect(order).not.toContain("databases");
    finishHttp();
    await done;
    expect(order.indexOf("databases")).toBeGreaterThan(
      order.indexOf("http drained"),
    );
  });

  it("gives the drain phase the gateway's budget (15 s − cleanup 1.5 s − flush 1 s)", async () => {
    const drain = jest.fn(async () => undefined);
    const g = registerGracefulShutdown(deps({ connections: { drain } }));
    await run(g);
    expect(drain.mock.calls[0][0]).toBeGreaterThan(12_400);
    expect(drain.mock.calls[0][0]).toBeLessThanOrEqual(12_500);
  });

  it("runs one shutdown for repeated SIGTERM and SIGINT", async () => {
    const d = deps();
    registerGracefulShutdown(d);
    handlers.SIGTERM();
    handlers.SIGTERM();
    handlers.SIGINT();
    await wait(20);
    expect(d.disconnectDatabases).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("exits 1 when requests had to be aborted or a job didn't finish, but still cleans up and flushes", async () => {
    const g = registerGracefulShutdown(
      deps({
        connections: {
          drain: async () => {
            throw new Error("1 connection(s) still open — aborted");
          },
        },
        closeWorker: async () => {
          throw new Error("active jobs still running");
        },
      }),
    );
    await run(g);
    expect(order).toEqual(
      expect.arrayContaining(["databases", "queues", "telemetry"]),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("gateway cluster primary", () => {
  it("hands the primary to runClusterPrimary with the gateway's budget, so SIGTERM is forwarded to every worker", async () => {
    const mockRunClusterPrimary = jest.fn();
    jest.resetModules();
    jest.doMock("node:cluster", () => ({
      __esModule: true,
      default: { isPrimary: true, fork: jest.fn(), on: jest.fn() },
    }));
    jest.doMock("@hrms/common", () => ({
      runClusterPrimary: mockRunClusterPrimary,
    }));
    process.env.WEB_CONCURRENCY = "2";
    jest.isolateModules(() => {
      require("../bootstrap");
    });
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));

    expect(mockRunClusterPrimary).toHaveBeenCalledWith(
      "api-gateway",
      2,
      expect.anything(),
      { workerGraceMs: 15_000 },
    );
    delete process.env.WEB_CONCURRENCY;
    jest.dontMock("node:cluster");
    jest.dontMock("@hrms/common");
  });
});
