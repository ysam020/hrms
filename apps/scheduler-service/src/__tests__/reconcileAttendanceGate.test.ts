// The attendance reconciliation is OFF by default — it must read and
// write nothing until the product decision enables it.
const touched: string[] = [];
const spy = new Proxy(
  {},
  {
    get: (_t, model: string) =>
      new Proxy(
        {},
        {
          get:
            (_m, op: string) =>
            (..._args: unknown[]) => {
              touched.push(`${model}.${op}`);
              return Promise.resolve([]);
            },
        },
      ),
  },
);
jest.mock("@hrms/db", () => ({
  prisma: spy,
  prismaWithTenant: spy,
  getClientForDb: () => ({}),
  getTenantId: () => "t1",
  runWithTenant: (_t: string, _c: unknown, fn: () => unknown) => fn(),
}));
jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  reconcileAttendance,
  isAttendanceReconcileEnabled,
} from "../jobs/reconcileAttendance";

describe("reconcileAttendance gate", () => {
  const saved = process.env.ATTENDANCE_RECONCILE_ENABLED;
  afterEach(() => {
    process.env.ATTENDANCE_RECONCILE_ENABLED = saved;
    touched.length = 0;
  });

  it.each([undefined, "", "false", "1", "TRUE"])(
    "is disabled when the flag is %p — touches no data",
    async (v) => {
      if (v === undefined) delete process.env.ATTENDANCE_RECONCILE_ENABLED;
      else process.env.ATTENDANCE_RECONCILE_ENABLED = v;
      expect(isAttendanceReconcileEnabled()).toBe(false);
      await reconcileAttendance();
      expect(touched).toEqual([]);
    },
  );

  it("runs only when the flag is exactly 'true'", async () => {
    process.env.ATTENDANCE_RECONCILE_ENABLED = "true";
    expect(isAttendanceReconcileEnabled()).toBe(true);
    await reconcileAttendance();
    expect(touched.length).toBeGreaterThan(0);
  });
});
