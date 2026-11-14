/**
 * Payroll disbursement worker against REAL MongoDB tenant databases and a
 * REAL BullMQ queue (the isolated containers from up.sh; setupEnv.cjs
 * refuses any non-local host).
 *
 * Proves that a disbursement job records the run's status in its own
 * tenant's database (never the master database, never another tenant's),
 * fails explicitly when it can't, and can be delivered again without
 * repeating financial side effects.
 *
 * No payment provider is involved: RazorpayX credentials are removed, so
 * disbursement runs in record-only mode. Email and PDF rendering are
 * replaced with counters at the module boundary.
 */
for (const k of [
  "RAZORPAY_X_KEY_ID",
  "RAZORPAY_X_KEY_SECRET",
  "RAZORPAY_X_ACCOUNT_NUMBER",
  "RAZORPAY_X_WEBHOOK_SECRET",
]) {
  delete process.env[k];
}

const mockNotify = jest.fn(async () => ({ queued: true }));
jest.mock("@hrms/notifications", () => ({
  ...jest.requireActual("@hrms/notifications"),
  notify: (...args: unknown[]) => (mockNotify as any)(...args),
}));

const mockBuildSlip = jest.fn(async () => ({
  buffer: Buffer.from("%PDF-synthetic"),
  employeeName: "Synthetic Employee",
  employeeUsername: "it.synthetic",
}));
jest.mock("../apps/api-gateway/src/handlers/salary", () => ({
  buildSalarySlipPdf: (...args: unknown[]) => (mockBuildSlip as any)(...args),
}));

// Lets a test simulate a crash before the disbursement pass, or after it
// completed but before the run's status was recorded.
const mockCrash = { beforePass: false, afterPass: 0 };
jest.mock("../apps/api-gateway/src/services/payrollDisbursement", () => {
  const actual = jest.requireActual(
    "../apps/api-gateway/src/services/payrollDisbursement",
  );
  return {
    ...actual,
    runPayrollDisbursement: async (runId: string) => {
      if (mockCrash.beforePass) throw new Error("simulated crash before pass");
      const summary = await actual.runPayrollDisbursement(runId);
      if (mockCrash.afterPass > 0) {
        mockCrash.afterPass--;
        throw new Error("simulated crash after pass");
      }
      return summary;
    },
  };
});

import { prisma, getClientForDb } from "@hrms/db";
import {
  getPayrollDisbursementQueue,
  getDeadLetterQueue,
  closeQueues,
} from "@hrms/queue";
import {
  processPayrollDisbursementJob,
  startPayrollDisbursementWorker,
  PayrollRunStatusError,
} from "../apps/api-gateway/src/workers/payrollDisbursementWorker";

const TENANT_A = "7f00000000000000000000a1";
const TENANT_B = "7f00000000000000000000b1";
const TENANT_GHOST = "7f00000000000000000000c1"; // not in the master DB
const DB_A = "hrms-it-acme";
const DB_B = "hrms-it-beta";
// The SAME run id exists in both tenant databases: only the database the
// job's tenant maps to may change.
const RUN = "7f00000000000000000000d1";
const RUN_ONLY_B = "7f00000000000000000000d2";
const HR = "7f00000000000000000000e1";
const EMPLOYEE_A = "7f00000000000000000000e2";
const MONTH = 6;
const YEAR = 2031; // far from any real period

const dbA = getClientForDb(DB_A) as any;
const dbB = getClientForDb(DB_B) as any;

const job = (tenantId: string, runId = RUN, extra: object = {}) =>
  ({
    id: `it-${tenantId}-${runId}`,
    data: { tenantId, runId, disbursedBy: HR },
    opts: {},
    ...extra,
  }) as any;

async function clearTenant(db: any, tenantId: string) {
  const runs = await db.payrollRun.findMany({
    where: { tenantId },
    select: { id: true },
  });
  const runIds = runs.map((r: { id: string }) => r.id);
  await db.payrollLineItem.deleteMany({
    where: { payrollRunId: { in: runIds } },
  });
  await db.payrollRun.deleteMany({ where: { tenantId } });
  await db.salaryAdvance.deleteMany({ where: { tenantId } });
  const notes = await db.notification.findMany({
    where: { tenantId },
    select: { id: true },
  });
  await db.notificationRecipient.deleteMany({
    where: { notificationId: { in: notes.map((n: any) => n.id) } },
  });
  await db.notification.deleteMany({ where: { tenantId } });
}

async function clearAll() {
  await clearTenant(dbA, TENANT_A);
  await clearTenant(dbB, TENANT_B);
  await prisma.user.deleteMany({ where: { id: EMPLOYEE_A } });
  await prisma.tenant.deleteMany({
    where: { id: { in: [TENANT_A, TENANT_B] } },
  });
}

const seedRun = (
  db: any,
  tenantId: string,
  id = RUN,
  month = MONTH,
  status = "disbursing",
) =>
  db.payrollRun.create({
    data: {
      id,
      tenantId,
      month,
      year: YEAR,
      status,
      initiatedBy: HR,
      approvedBy: HR,
      totalGross: 10000,
      totalNet: 9000,
      totalDeductions: 1000,
      employeeCount: 1,
    },
  });

const runIn = (db: any, id = RUN) =>
  db.payrollRun.findUnique({ where: { id } });

/** Master DB must never hold a payroll run (it has no such collection in use). */
async function masterPayrollRunCount(): Promise<number> {
  const r = (await prisma.$runCommandRaw({
    count: "payroll_runs",
    query: {},
  })) as { n?: number };
  return r.n ?? 0;
}

/** Employee A with a salary advance and one line item awaiting payout. */
async function seedEmployeeWithAdvance() {
  await prisma.user.create({
    data: {
      id: EMPLOYEE_A,
      tenantId: TENANT_A,
      username: "it.fpr01.employee",
      email: "it.fpr01.employee@example.test",
      first_name: "Synthetic",
      employeeStatus: "Active",
    },
  });
  const advance = await dbA.salaryAdvance.create({
    data: {
      tenantId: TENANT_A,
      userId: EMPLOYEE_A,
      amount: 3000,
      emiAmount: 1000,
      emiMonths: 3,
      paidMonths: 0,
      remainingAmount: 3000,
      status: "Approved",
    },
  });
  await dbA.payrollLineItem.create({
    data: {
      tenantId: TENANT_A,
      payrollRunId: RUN,
      userId: EMPLOYEE_A,
      grossSalary: 10000,
      basicPay: 5000,
      hra: 2500,
      conveyance: 2500,
      pf: 0,
      esi: 0,
      pt: 0,
      tds: 0,
      advanceDeduction: 1000,
      totalDeductions: 1000,
      netPayable: 9000,
    },
  });
  return advance.id as string;
}

async function sideEffects(advanceId: string) {
  const adv = await dbA.salaryAdvance.findUnique({ where: { id: advanceId } });
  const items = await dbA.payrollLineItem.findMany({
    where: { payrollRunId: RUN },
  });
  const notes = await dbA.notification.findMany({
    where: { tenantId: TENANT_A, eventType: "payroll" },
    include: { recipients: true },
  });
  return {
    remaining: adv.remainingAmount,
    paidMonths: adv.paidMonths,
    postProcessed: items.map((i: any) => i.postProcessed),
    notifications: notes.length,
    recipients: notes.reduce((n: number, x: any) => n + x.recipients.length, 0),
  };
}

async function waitFor<T>(
  read: () => Promise<T>,
  done: (v: T) => boolean,
  ms = 30000,
): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (done(v) || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  await getPayrollDisbursementQueue().obliterate({ force: true });
  await getDeadLetterQueue().obliterate({ force: true });
  await clearAll();
});

beforeEach(async () => {
  mockCrash.beforePass = false;
  mockCrash.afterPass = 0;
  mockNotify.mockClear();
  mockBuildSlip.mockClear();
  await clearAll();
  await prisma.tenant.create({
    data: {
      id: TENANT_A,
      name: "IT Tenant A",
      slug: "it-fpr01-a",
      dbName: DB_A,
    },
  });
  await prisma.tenant.create({
    data: {
      id: TENANT_B,
      name: "IT Tenant B",
      slug: "it-fpr01-b",
      dbName: DB_B,
    },
  });
  await seedRun(dbA, TENANT_A);
  await seedRun(dbB, TENANT_B);
});

afterAll(async () => {
  await clearAll();
  await closeQueues();
  await prisma.$disconnect();
});

describe("tenant isolation of the run status", () => {
  it("tenant A's job updates only tenant A's run", async () => {
    await processPayrollDisbursementJob(job(TENANT_A));

    const a = await runIn(dbA);
    const b = await runIn(dbB);
    expect(a.status).toBe("disbursed");
    expect(a.disbursedBy).toBe(HR);
    expect(a.disbursedAt).toBeInstanceOf(Date);
    expect(b.status).toBe("disbursing");
    expect(b.disbursedAt).toBeNull();
    expect(await masterPayrollRunCount()).toBe(0);
  });

  it("tenant B's job updates only tenant B's run", async () => {
    await processPayrollDisbursementJob(job(TENANT_B));

    expect((await runIn(dbB)).status).toBe("disbursed");
    expect((await runIn(dbA)).status).toBe("disbursing");
    expect(await masterPayrollRunCount()).toBe(0);
  });

  it("a run that exists only in another tenant's database is an explicit failure, and that run is untouched", async () => {
    await seedRun(dbB, TENANT_B, RUN_ONLY_B, MONTH + 1);

    const err = await processPayrollDisbursementJob(
      job(TENANT_A, RUN_ONLY_B),
    ).catch((e) => e);

    // The disbursement pass itself refuses a run it can't find in the
    // bound tenant database (before any payout or status work); the
    // worker's own RUN_NOT_FOUND check covers a run that disappears after
    // the pass (unit-tested). Either way: an explicit failure.
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/not found/i);
    expect((await runIn(dbB, RUN_ONLY_B)).status).toBe("disbursing");
    expect((await runIn(dbB, RUN_ONLY_B)).disbursedAt).toBeNull();
  });

  it("a tenant missing from the master database is refused before anything runs", async () => {
    const err = await processPayrollDisbursementJob(job(TENANT_GHOST)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(PayrollRunStatusError);
    expect(err.code).toBe("TENANT_UNRESOLVED");
    expect((await runIn(dbA)).status).toBe("disbursing");
    expect((await runIn(dbB)).status).toBe("disbursing");
  });
});

describe("redelivery and recovery", () => {
  it("delivering the same job twice records the run once and repeats no financial side effect", async () => {
    const advanceId = await seedEmployeeWithAdvance();

    await processPayrollDisbursementJob(job(TENANT_A));
    const first = await sideEffects(advanceId);
    const firstRun = await runIn(dbA);

    await processPayrollDisbursementJob(job(TENANT_A)); // redelivery
    const second = await sideEffects(advanceId);

    expect(first).toEqual({
      remaining: 2000,
      paidMonths: 1,
      postProcessed: [true],
      notifications: 1,
      recipients: 1,
    });
    expect(second).toEqual(first);
    expect(firstRun.status).toBe("disbursed");
    expect((await runIn(dbA)).disbursedAt).toEqual(firstRun.disbursedAt);
    await waitFor(
      async () => mockNotify.mock.calls.length,
      (n) => n >= 1,
    );
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect((await runIn(dbB)).status).toBe("disbursing");
  });

  it("a crash after the pass but before the status was recorded is completed by the queue's retry, with side effects once", async () => {
    const advanceId = await seedEmployeeWithAdvance();
    mockCrash.afterPass = 1;
    const worker = startPayrollDisbursementWorker();
    try {
      await getPayrollDisbursementQueue().add(
        "disburse",
        { tenantId: TENANT_A, runId: RUN, disbursedBy: HR },
        { attempts: 2, backoff: { type: "fixed", delay: 200 } },
      );
      const run = await waitFor(
        () => runIn(dbA),
        (r: any) => r.status === "disbursed",
      );
      expect(run.status).toBe("disbursed");
      expect(await sideEffects(advanceId)).toEqual({
        remaining: 2000,
        paidMonths: 1,
        postProcessed: [true],
        notifications: 1,
        recipients: 1,
      });
      expect((await runIn(dbB)).status).toBe("disbursing");
    } finally {
      await worker.close();
    }
  });

  it("a job that keeps failing leaves the run in 'disbursement_failed' (retryable), not stuck in 'disbursing', and reports it", async () => {
    mockCrash.beforePass = true;
    const worker = startPayrollDisbursementWorker();
    try {
      await getPayrollDisbursementQueue().add(
        "disburse",
        { tenantId: TENANT_A, runId: RUN, disbursedBy: HR },
        { attempts: 2, backoff: { type: "fixed", delay: 200 } },
      );
      const run = await waitFor(
        () => runIn(dbA),
        (r: any) => r.status === "disbursement_failed",
      );
      expect(run.status).toBe("disbursement_failed");
      expect((await runIn(dbB)).status).toBe("disbursing");

      const dlq = await waitFor(
        () => getDeadLetterQueue().getJobs(["waiting", "delayed"]),
        (jobs) => jobs.length > 0,
      );
      expect(dlq[0].name).toBe("failed-payroll-disbursement");
      expect(dlq[0].data).toMatchObject({
        runStatusRecorded: true,
        originalJobData: { tenantId: TENANT_A, runId: RUN },
      });

      // Recovery: retry-payouts moves the run back to "disbursing" and
      // enqueues again; once the cause is gone the run completes.
      mockCrash.beforePass = false;
      await dbA.payrollRun.update({
        where: { id: RUN, status: "disbursement_failed" },
        data: { status: "disbursing" },
      });
      await getPayrollDisbursementQueue().add(
        "disburse",
        { tenantId: TENANT_A, runId: RUN, disbursedBy: HR },
        { attempts: 1 },
      );
      const recovered = await waitFor(
        () => runIn(dbA),
        (r: any) => r.status === "disbursed",
      );
      expect(recovered.status).toBe("disbursed");
    } finally {
      await worker.close();
    }
  });
});
