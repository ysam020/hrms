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
  limitReads,
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
