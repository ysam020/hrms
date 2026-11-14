/**
 * Money-movement regression suite: payroll payouts, payout webhooks and
 * salary-advance recovery, against REAL MongoDB tenant databases (up.sh)
 * and a LOCAL fake RazorpayX (helpers/fakeRazorpayX.ts). No real payment
 * endpoint is reachable from this file: the fake refuses non-local hosts.
 *
 * Two kinds of test:
 *  - it(...)          behaviour that is correct today and must stay so;
 *  - it.failing(...)  the CORRECT behaviour for a gap that is still open.
 *    Jest reports these as passing while they fail. When a fix lands, the
 *    test starts passing, Jest flags it, and the fix PR turns it into a
 *    plain it(...).
 *
 * Every it.failing test calls reached() just before its final assertion,
 * and afterAll() checks they all got there — so a broken setup can't hide
 * behind an "expected failure".
 */
process.env.RAZORPAY_X_KEY_ID = "rzp_test_fake_it";
process.env.RAZORPAY_X_KEY_SECRET = "fake-secret-it";
process.env.RAZORPAY_X_ACCOUNT_NUMBER = "0000000000000";
process.env.RAZORPAY_X_WEBHOOK_SECRET = "fake-webhook-secret-it";
delete process.env.RAZORPAY_KEY_ID;

const mockNotify = jest.fn(async () => ({ queued: true }));
jest.mock("@hrms/notifications", () => ({
  ...jest.requireActual("@hrms/notifications"),
  notify: (...args: unknown[]) => (mockNotify as any)(...args),
}));
jest.mock("../apps/api-gateway/src/handlers/salary", () => ({
  buildSalarySlipPdf: async () => ({
    buffer: Buffer.from("%PDF-synthetic"),
    employeeName: "Synthetic Employee",
    employeeUsername: "it.synthetic",
  }),
}));

import { createHmac, randomUUID } from "node:crypto";
import { prisma, getClientForDb } from "@hrms/db";
import { processPayrollDisbursementJob } from "../apps/api-gateway/src/workers/payrollDisbursementWorker";
import { handleRazorpayXWebhook } from "../apps/api-gateway/src/handlers/razorpayxWebhook";
import { installFakeRazorpayX, FakeRazorpayX } from "./helpers/fakeRazorpayX";

const TENANT = "7f00000000000000000001a1";
const DB = "hrms-it-acme";
const RUN = "7f00000000000000000001d1";
const HR = "7f00000000000000000001e1";
const EMP = "7f00000000000000000001e2";
const MONTH = 7;
const YEAR = 2031;

const db = getClientForDb(DB) as any;
let fake: FakeRazorpayX;
let advanceId: string;

const expectedFailures = new Set<string>();
const reachedFailures = new Set<string>();
function reached(name: string) {
  reachedFailures.add(name);
}
// OPEN_GAPS_AS_PLAIN=1 runs the open-gap tests as ordinary tests, to read
// exactly how each one fails today.
function failing(name: string, fn: () => Promise<void>) {
  expectedFailures.add(name);
  (process.env.OPEN_GAPS_AS_PLAIN ? it : it.failing)(name, fn);
}

const disburse = () =>
  processPayrollDisbursementJob({
    id: `it-${randomUUID()}`,
    data: { tenantId: TENANT, runId: RUN, disbursedBy: HR },
    opts: {},
  } as any);

const item = async () =>
  (await db.payrollLineItem.findMany({ where: { payrollRunId: RUN } }))[0];
const run = () => db.payrollRun.findUnique({ where: { id: RUN } });
const advance = () => db.salaryAdvance.findUnique({ where: { id: advanceId } });
const payrollNotices = () =>
  db.notification.count({ where: { tenantId: TENANT, eventType: "payroll" } });

/** Calls the real webhook handler with a correctly signed synthetic event. */
async function deliverWebhook(
  event: string,
  payoutId: string,
  eventId = `evt_${randomUUID()}`,
) {
  const raw = JSON.stringify({
    event,
    payload: {
      payout: { entity: { id: payoutId, status: event.split(".")[1] } },
    },
  });
  const signature = createHmac("sha256", process.env.RAZORPAY_X_WEBHOOK_SECRET!)
    .update(raw)
    .digest("hex");
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  await handleRazorpayXWebhook(
    {
      body: Buffer.from(raw),
      headers: {
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
      },
    } as any,
    res,
  );
  return res as { statusCode: number; body: any };
}

async function clear() {
  await db.payrollLineItem.deleteMany({ where: { payrollRunId: RUN } });
  await db.payrollRun.deleteMany({ where: { id: RUN } });
  await db.salaryAdvance.deleteMany({ where: { tenantId: TENANT } });
  const notes = await db.notification.findMany({
    where: { tenantId: TENANT },
    select: { id: true },
  });
  await db.notificationRecipient.deleteMany({
    where: { notificationId: { in: notes.map((n: any) => n.id) } },
  });
  await db.notification.deleteMany({ where: { tenantId: TENANT } });
  await prisma.payoutTenantIndex.deleteMany({ where: { tenantId: TENANT } });
  await prisma.webhookInboxEvent.deleteMany({
    where: { provider: "razorpayx" },
  });
  await prisma.user.deleteMany({ where: { id: EMP } });
  await prisma.tenant.deleteMany({ where: { id: TENANT } });
}

// Fault injection for "the process died between two writes": throws once
// on the write that marks a line item post-processed.
const fault = { failPostProcessedWriteOnce: false };
db.$use(async (params: any, next: (p: any) => Promise<any>) => {
  if (
    fault.failPostProcessedWriteOnce &&
    params.model === "PayrollLineItem" &&
    params.action === "update" &&
    params.args?.data?.postProcessed === true
  ) {
    fault.failPostProcessedWriteOnce = false;
    throw new Error("simulated crash before the line item was marked done");
  }
  return next(params);
});

beforeAll(async () => {
  fake = await installFakeRazorpayX();
});

beforeEach(async () => {
  fake.reset();
  fault.failPostProcessedWriteOnce = false;
  mockNotify.mockClear();
  await clear();
  await prisma.tenant.create({
    data: { id: TENANT, name: "IT Money Tenant", slug: "it-money", dbName: DB },
  });
  await prisma.user.create({
    data: {
      id: EMP,
      tenantId: TENANT,
      username: "it.money.employee",
      email: "it.money.employee@example.test",
      first_name: "Synthetic",
      employeeStatus: "Active",
      bank_account_no: "000111222333",
      ifsc_code: "FAKE0000001",
    },
  });
  await db.payrollRun.create({
    data: {
      id: RUN,
      tenantId: TENANT,
      month: MONTH,
      year: YEAR,
      status: "disbursing",
      initiatedBy: HR,
      approvedBy: HR,
      totalGross: 10000,
      totalNet: 9000,
      totalDeductions: 1000,
      employeeCount: 1,
    },
  });
  advanceId = (
    await db.salaryAdvance.create({
      data: {
        tenantId: TENANT,
        userId: EMP,
        amount: 3000,
        emiAmount: 1000,
        emiMonths: 3,
        paidMonths: 0,
        remainingAmount: 3000,
        status: "Approved",
      },
    })
  ).id;
  await db.payrollLineItem.create({
    data: {
      tenantId: TENANT,
      payrollRunId: RUN,
      userId: EMP,
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
});

afterAll(async () => {
  await clear();
  await fake.close();
  await prisma.$disconnect();
  const missing = [...expectedFailures].filter((n) => !reachedFailures.has(n));
  if (missing.length) {
    throw new Error(
      `expected-failure tests that never reached their assertion (broken setup?): ${missing.join(" | ")}`,
    );
  }
});

describe("payout confirmation", () => {
  it("a payout the provider reports as processed is paid once: advance reduced once, one notice", async () => {
    fake.mode = "processed";
    await disburse();

    expect((await item()).payoutStatus).toBe("processed");
    expect((await item()).postProcessed).toBe(true);
    expect((await advance()).remainingAmount).toBe(2000);
    expect(await payrollNotices()).toBe(1);
    expect(fake.payouts.size).toBe(1);
  });

  failing(
    "a payout still in flight is not treated as paid (no advance recovery, no 'salary disbursed' notice)",
    async () => {
      fake.mode = "processing";
      await disburse();
      expect((await item()).payoutStatus).toBe("processing");
      reached(
        "a payout still in flight is not treated as paid (no advance recovery, no 'salary disbursed' notice)",
      );
      expect({
        postProcessed: (await item()).postProcessed,
        remaining: (await advance()).remainingAmount,
        notices: await payrollNotices(),
      }).toEqual({ postProcessed: false, remaining: 3000, notices: 0 });
    },
  );

  it("a rejected payout is recorded on the employee's line as failed", async () => {
    fake.mode = "reject";
    await disburse();

    expect((await item()).payoutStatus).toBe("failed");
    expect((await item()).payoutAttempts).toBe(1);
    expect((await advance()).remainingAmount).toBe(3000);
    expect(await payrollNotices()).toBe(0);
  });

  failing(
    "a run with a failed employee payout is not reported as fully disbursed",
    async () => {
      fake.mode = "reject";
      await disburse();
      expect((await item()).payoutStatus).toBe("failed");
      reached(
        "a run with a failed employee payout is not reported as fully disbursed",
      );
      expect((await run()).status).not.toBe("disbursed");
    },
  );

  failing(
    "a provider outcome that is unknown (connection lost after acceptance) is not recorded as a failure",
    async () => {
      fake.mode = "accept_then_drop";
      await disburse();
      expect(fake.payouts.size).toBe(1); // the provider did accept it
      reached(
        "a provider outcome that is unknown (connection lost after acceptance) is not recorded as a failure",
      );
      expect((await item()).payoutStatus).not.toBe("failed");
    },
  );

  it("retrying after an unknown outcome does not create a second transfer at the provider", async () => {
    fake.mode = "accept_then_drop";
    await disburse();
    fake.mode = "processing";
    await disburse();

    expect(fake.payouts.size).toBe(1);
    expect(fake.payoutRequests).toBe(2);
  });

  it("two concurrent disbursement passes create one transfer per employee", async () => {
    fake.mode = "processing";
    await Promise.allSettled([disburse(), disburse()]);

    expect(fake.payouts.size).toBe(1);
  });
});

describe("salary advance recovery", () => {
  failing(
    "an advance instalment is recovered once even if the process dies before the line is marked done",
    async () => {
      fake.mode = "processed";
      fault.failPostProcessedWriteOnce = true;
      await expect(disburse()).rejects.toThrow(/simulated crash/);
      await disburse(); // the queue's retry
      expect((await item()).postProcessed).toBe(true);
      reached(
        "an advance instalment is recovered once even if the process dies before the line is marked done",
      );
      expect((await advance()).remainingAmount).toBe(2000);
    },
  );
});

describe("payout webhooks", () => {
  async function paidOut(): Promise<string> {
    fake.mode = "processing";
    await disburse();
    const payoutId = (await item()).payoutId as string;
    expect(payoutId).toMatch(/^pout_fake_/);
    return payoutId;
  }

  it("rejects a webhook with a bad signature and changes nothing", async () => {
    const payoutId = await paidOut();
    const raw = JSON.stringify({
      event: "payout.reversed",
      payload: { payout: { entity: { id: payoutId } } },
    });
    const res: any = { statusCode: 200 };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = () => res;
    await handleRazorpayXWebhook(
      {
        body: Buffer.from(raw),
        headers: { "x-razorpay-signature": "0".repeat(64) },
      } as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect((await item()).payoutStatus).toBe("processing");
  });

  it("applies a redelivered webhook once", async () => {
    const payoutId = await paidOut();
    const first = await deliverWebhook(
      "payout.processed",
      payoutId,
      "evt_dup_1",
    );
    const second = await deliverWebhook(
      "payout.processed",
      payoutId,
      "evt_dup_1",
    );

    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    const inbox = await prisma.webhookInboxEvent.findMany({
      where: { provider: "razorpayx", eventId: "evt_dup_1" },
    });
    expect(inbox).toHaveLength(1);
    expect(inbox[0].status).toBe("processed");
    expect(inbox[0].attempts).toBe(1);
    expect((await item()).payoutStatus).toBe("processed");
  });

  it("records a reversal", async () => {
    const payoutId = await paidOut();
    await deliverWebhook("payout.reversed", payoutId);
    expect((await item()).payoutStatus).toBe("reversed");
  });

  failing(
    "a stale success event delivered after a reversal cannot overwrite it",
    async () => {
      const payoutId = await paidOut();
      await deliverWebhook("payout.reversed", payoutId);
      expect((await item()).payoutStatus).toBe("reversed");
      await deliverWebhook("payout.processed", payoutId);
      reached(
        "a stale success event delivered after a reversal cannot overwrite it",
      );
      expect((await item()).payoutStatus).toBe("reversed");
    },
  );
});
