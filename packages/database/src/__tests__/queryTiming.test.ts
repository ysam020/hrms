jest.mock("@hrms/logger", () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import { logger } from "@hrms/logger";
import {
  attachQueryTiming,
  currentQueryStats,
  endQueryStats,
  limitReads,
  recordDownstream,
  recordExternal,
  recordStage,
  summarizeQueryStats,
  withQueryStats,
} from "../queryTiming";

function fakeClient() {
  let mw: any;
  return {
    $use: (fn: any) => (mw = fn),
    run: (params: any, result: () => Promise<unknown>) => mw(params, result),
  };
}

describe("queryTiming", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PRISMA_SLOW_QUERY_MS;
  });

  it("counts queries inside a request scope and tracks the slowest", async () => {
    const c = fakeClient();
    attachQueryTiming(c, "tenant");
    await withQueryStats(async () => {
      await c.run({ model: "User", action: "findMany" }, async () => []);
      await c.run({ model: "Team", action: "findMany" }, async () => []);
      const s = currentQueryStats()!;
      expect(s.count).toBe(2);
      expect(s.slowest?.model).toBeDefined();
    });
    expect(currentQueryStats()).toBeUndefined();
  });

  it("logs slow queries with model/action/ms only — never the arguments", async () => {
    process.env.PRISMA_SLOW_QUERY_MS = "0";
    const c = fakeClient();
    attachQueryTiming(c, "master");
    await c.run(
      {
        model: "JobApplication",
        action: "findFirst",
        args: { where: { aadharNo: "123412341234" } },
      },
      async () => null,
    );
    const [, meta] = (logger.warn as jest.Mock).mock.calls[0];
    expect(Object.keys(meta).sort()).toEqual([
      "action",
      "model",
      "ms",
      "scope",
    ]);
    expect(JSON.stringify(meta)).not.toContain("123412341234");
  });

  it("still records a query that throws, and rethrows", async () => {
    const c = fakeClient();
    attachQueryTiming(c, "tenant");
    await withQueryStats(async () => {
      await expect(
        c.run({ model: "User", action: "update" }, async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(currentQueryStats()!.count).toBe(1);
    });
  });

  describe("limitReads", () => {
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => (resolve = r));
      return { promise, resolve };
    };

    it("never has more reads in flight than the cap, and records the wait", async () => {
      const c = fakeClient();
      attachQueryTiming(c, "tenant");
      await withQueryStats(async () => {
        limitReads(2);
        const gates = Array.from({ length: 5 }, deferred);
        const runs = gates.map((g) =>
          c.run({ model: "User", action: "count" }, () => g.promise),
        );
        await new Promise((r) => setImmediate(r));
        expect(currentQueryStats()!.maxInFlight).toBe(2);
        for (const g of gates) {
          g.resolve();
          await new Promise((r) => setImmediate(r));
        }
        await Promise.all(runs);
        const s = currentQueryStats()!;
        expect(s.count).toBe(5);
        expect(s.maxInFlight).toBe(2);
        expect(s.capWaitMs).toBeGreaterThanOrEqual(0);
      });
    });

    it("never holds back writes (no deadlock with a nested audit read)", async () => {
      const c = fakeClient();
      attachQueryTiming(c, "tenant");
      await withQueryStats(async () => {
        limitReads(1);
        const read = deferred();
        const slowRead = c.run(
          { model: "User", action: "findMany" },
          () => read.promise,
        );
        await c.run({ model: "User", action: "update" }, async () => ({}));
        read.resolve();
        await slowRead;
        expect(currentQueryStats()!.count).toBe(2);
      });
    });

    it("is per request: another request's scope is unaffected", async () => {
      const c = fakeClient();
      attachQueryTiming(c, "tenant");
      const gate = deferred();
      const capped = withQueryStats(async () => {
        limitReads(1);
        await c.run({ model: "User", action: "count" }, () => gate.promise);
      });
      await withQueryStats(async () => {
        await Promise.all([
          c.run({ model: "User", action: "count" }, async () => 1),
          c.run({ model: "User", action: "count" }, async () => 1),
        ]);
        expect(currentQueryStats()!.maxInFlight).toBe(2);
      });
      gate.resolve();
      await capped;
    });
  });
});

describe("request latency breakdown", () => {
  it("never sums overlapping waits: ioBusyMs is their union", () =>
    withQueryStats(() => {
      const stats = currentQueryStats()!;
      const t0 = stats.startedAt;
      // db 0–100 and redis 50–150 overlap; grpc 200–250 stands alone.
      stats.ops.push({
        kind: "db",
        name: "tenant:Leave.findMany",
        start: t0,
        end: t0 + 100,
      });
      recordExternal("redis", "redis:get", t0 + 50, t0 + 150);
      recordDownstream(50, "getLeaves", t0 + 200);
      const s = summarizeQueryStats(stats, t0, { ops: true });
      expect(s.ioBusyMs).toBe(200);
      expect(s.redisCalls).toBe(1);
      expect(s.redisMs).toBe(100);
      expect(s.downstreamCalls).toBe(1);
      expect(s.ops?.map((o) => o[0])).toEqual([
        "tenant:Leave.findMany",
        "redis:get",
        "grpc:getLeaves",
      ]);
      expect(s.nonIoMs).toBe(s.totalMs - 200);
      endQueryStats(stats);
    }));

  it("records database queries in the op list with model and scope", async () => {
    const client = fakeClient();
    attachQueryTiming(client as any, "master");
    await withQueryStats(async () => {
      await client.run(
        { model: "User", action: "findUnique" },
        async () => null,
      );
      const s = summarizeQueryStats(
        currentQueryStats()!,
        currentQueryStats()!.startedAt,
        { ops: true },
      );
      expect(s.ops?.[0][0]).toBe("master:User.findUnique");
      endQueryStats(currentQueryStats()!);
    });
  });

  it("accumulates named stages with call counts", () =>
    withQueryStats(() => {
      recordStage("authenticate", 2);
      recordStage("authenticate", 3);
      const s = summarizeQueryStats(
        currentQueryStats()!,
        currentQueryStats()!.startedAt,
      );
      expect(s.stages.authenticate).toEqual({ n: 2, ms: 5 });
      expect(s.ops).toBeUndefined();
      endQueryStats(currentQueryStats()!);
    }));

  it("flags CPU as unattributable when tracked requests overlap", () => {
    const track = { trackOverlap: true };
    let outer: any;
    withQueryStats(() => {
      outer = currentQueryStats()!;
    }, track);
    withQueryStats(() => {
      const inner = currentQueryStats()!;
      expect(inner.maxOverlap).toBe(1);
      expect(outer.maxOverlap).toBe(1);
      expect(summarizeQueryStats(inner, inner.startedAt).cpuMs).toBeNull();
      endQueryStats(inner);
    }, track);
    endQueryStats(outer);
    withQueryStats(() => {
      const alone = currentQueryStats()!;
      expect(alone.maxOverlap).toBe(0);
      expect(summarizeQueryStats(alone, alone.startedAt).cpuMs).not.toBeNull();
      endQueryStats(alone);
    }, track);
  });

  it("does not track (or retain) scopes opened without trackOverlap", () =>
    withQueryStats(() => {
      // gRPC handler scopes are never ended; they must not pin memory.
      expect(currentQueryStats()!.maxOverlap).toBe(-1);
      expect(summarizeQueryStats(currentQueryStats()!, 0).cpuMs).toBeNull();
    }));
});
