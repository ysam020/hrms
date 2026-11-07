import { EventEmitter } from "node:events";

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from "@hrms/logger";
import {
  createGracefulShutdown,
  handleShutdownSignals,
  processShutdown,
  resetProcessShutdownForTests,
  runClusterPrimary,
  shutdownGraceMs,
} from "../shutdown";

// Budget 8 000 ms: drain ends at 6 000, cleanup at 7 500, flush at 8 000.
const GRACE = 8_000;

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

const flush = () =>
  new Promise((r) => jest.requireActual("timers").setImmediate(r));

describe("graceful shutdown", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    delete process.env.SHUTDOWN_GRACE_MS;
  });
  afterEach(() => jest.useRealTimers());

  it("exits 0 straight away on SIGTERM while idle", async () => {
    const exit = jest.fn();
    const g = createGracefulShutdown("svc", { graceMs: GRACE, exit });
    g.onShutdown("idle worker", async () => undefined, "drain");
    await g.shutdown("SIGTERM");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("waits for an active job that finishes within the drain period, then cleans up, then exits 0", async () => {
    const exit = jest.fn();
    const order: string[] = [];
    const job = deferred();
    const g = createGracefulShutdown("svc", { graceMs: GRACE, exit });
    // Registered in "wrong" order on purpose: phases, not registration, decide.
    g.onShutdown("db", async () => void order.push("db closed"), "cleanup");
    g.onShutdown("telemetry", async () => void order.push("flushed"), "flush");
    g.onShutdown(
      "worker",
      async () => {
        await job.promise;
        order.push("worker drained");
      },
      "drain",
    );

    const done = g.shutdown("SIGTERM");
    await flush();
    jest.advanceTimersByTime(3_000); // job still running at 3 s
    expect(order).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
    job.resolve();
    await done;

    // Database clients stay open until the job using them has finished.
    expect(order).toEqual(["worker drained", "db closed", "flushed"]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("gives up on a job that outlasts the drain period, still cleans up and flushes, and exits 1 within the budget", async () => {
    const exit = jest.fn();
    const cleaned = jest.fn();
    const flushed = jest.fn();
    const g = createGracefulShutdown("svc", { graceMs: GRACE, exit });
    let drainBudget = -1;
    g.onShutdown(
      "slow worker",
      (ms) => {
        drainBudget = ms;
        return new Promise(() => {}); // never finishes
      },
      "drain",
    );
    g.onShutdown("db", async () => cleaned(), "cleanup");
    g.onShutdown("telemetry", async () => flushed(), "flush");

    const done = g.shutdown("SIGTERM");
    await flush();
    expect(drainBudget).toBe(6_000); // budget minus cleanup + flush reserves
    jest.advanceTimersByTime(6_000);
    await done;

    expect(cleaned).toHaveBeenCalled();
    expect(flushed).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('"slow worker" did not finish within 6000 ms'),
    );
  });

  it("bounds a telemetry flush that hangs, and still exits", async () => {
    const exit = jest.fn();
    const g = createGracefulShutdown("svc", { graceMs: GRACE, exit });
    g.onShutdown("telemetry", () => new Promise(() => {}), "flush");
    const done = g.shutdown("SIGTERM");
    await flush();
    jest.advanceTimersByTime(GRACE);
    await done;
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("runs the remaining steps when a cleanup step fails, and exits 1", async () => {
    const exit = jest.fn();
    const other = jest.fn();
    const flushed = jest.fn();
    const g = createGracefulShutdown("svc", { graceMs: GRACE, exit });
    g.onShutdown(
      "queues",
      async () => {
        throw new Error("redis gone");
      },
      "cleanup",
    );
    g.onShutdown("db", async () => other(), "cleanup");
    g.onShutdown("telemetry", async () => flushed(), "flush");
    await g.shutdown("SIGTERM");
    expect(other).toHaveBeenCalled();
    expect(flushed).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("runs once however many signals arrive (repeated SIGTERM, then SIGINT)", async () => {
    const exit = jest.fn();
    const step = jest.fn(async () => undefined);
    const g = createGracefulShutdown("svc", { graceMs: GRACE, exit });
    g.onShutdown("worker", step);
    await Promise.all([
      g.shutdown("SIGTERM"),
      g.shutdown("SIGTERM"),
      g.shutdown("SIGINT"),
    ]);
    expect(step).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(g.isShuttingDown()).toBe(true);
  });

  it("installs one SIGTERM and one SIGINT handler per coordinator, however often asked", () => {
    const on = jest.spyOn(process, "on").mockImplementation(() => process);
    const g = createGracefulShutdown("svc", { exit: jest.fn() });
    handleShutdownSignals(g);
    handleShutdownSignals(g);
    expect(on.mock.calls.map(([signal]) => signal)).toEqual([
      "SIGTERM",
      "SIGINT",
    ]);
    on.mockRestore();
  });

  it("gives a process one shared coordinator, so gRPC server and workers drain under one signal", () => {
    const on = jest.spyOn(process, "on").mockImplementation(() => process);
    resetProcessShutdownForTests();
    const a = processShutdown("svc");
    const b = processShutdown("svc");
    expect(a).toBe(b);
    expect(on).toHaveBeenCalledTimes(2); // SIGTERM + SIGINT, once
    resetProcessShutdownForTests();
    on.mockRestore();
  });

  it("reads the budget from SHUTDOWN_GRACE_MS, defaulting to 8 s (below Docker's default 10 s)", () => {
    expect(shutdownGraceMs()).toBe(8_000);
    process.env.SHUTDOWN_GRACE_MS = "12000";
    expect(shutdownGraceMs()).toBe(12_000);
    process.env.SHUTDOWN_GRACE_MS = "soon";
    expect(shutdownGraceMs()).toBe(8_000);
  });
});

describe("cluster primary", () => {
  const makeWorker = (dead = false) => {
    const w: any = new EventEmitter();
    w.isDead = () => dead;
    w.process = {
      pid: 1,
      kill: jest.fn(() => setImmediate(() => w.emit("exit", 0))),
    };
    return w;
  };
  const fakeCluster = (workers: Record<string, any>) => {
    const c: any = new EventEmitter();
    c.workers = workers;
    c.fork = jest.fn();
    return c;
  };
  let on: jest.SpyInstance;
  let log: jest.SpyInstance;
  let errorLog: jest.SpyInstance;
  beforeEach(() => {
    on = jest.spyOn(process, "on").mockImplementation(() => process);
    log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    on.mockRestore();
    log.mockRestore();
    errorLog.mockRestore();
  });

  it("forks the workers and respawns one that dies", () => {
    const c = fakeCluster({});
    runClusterPrimary("svc", 3, c, { exit: jest.fn() });
    expect(c.fork).toHaveBeenCalledTimes(3);
    c.emit("exit", makeWorker(), 1, null);
    expect(c.fork).toHaveBeenCalledTimes(4);
  });

  it("exits 1 when a worker's own shutdown fails (it exits non-zero), still waiting for every worker", async () => {
    const ok = makeWorker();
    const failing = makeWorker();
    failing.process.kill = jest.fn(() =>
      setImmediate(() => failing.emit("exit", 1)),
    );
    const c = fakeCluster({ 1: ok, 2: failing });
    const exit = jest.fn();
    const g = runClusterPrimary("svc", 2, c, { exit });

    await g.shutdown("SIGTERM");

    expect(ok.process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("waits for the workers' own budget plus 1 s", async () => {
    jest.useFakeTimers();
    const hung = makeWorker();
    hung.process.kill = jest.fn(); // never exits
    const c = fakeCluster({ 1: hung });
    const exit = jest.fn();
    const g = runClusterPrimary("svc", 1, c, { exit, workerGraceMs: 15_000 });

    const done = g.shutdown("SIGTERM");
    await Promise.resolve();
    jest.advanceTimersByTime(15_999);
    expect(exit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await done;
    expect(exit).toHaveBeenCalledWith(1);
    jest.useRealTimers();
  });

  it("on SIGTERM passes it to each live worker, waits for them, and does not respawn", async () => {
    const live = [makeWorker(), makeWorker()];
    const c = fakeCluster({ 1: live[0], 2: live[1], 3: makeWorker(true) });
    const exit = jest.fn();
    const g = runClusterPrimary("svc", 2, c, { exit });
    c.fork.mockClear();

    await g.shutdown("SIGTERM");
    c.emit("exit", live[0], 0, null);

    expect(live[0].process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(live[1].process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(c.fork).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });
});
