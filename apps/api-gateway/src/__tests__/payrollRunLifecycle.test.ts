import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { emitWebhookEvent } from "../utils/webhookEmitter";
import {
  listPayrollRuns,
  getPayrollRun,
  updatePayrollRunStatus,
  retryFailedPayouts,
  requestSalaryAdvance,
  listSalaryAdvances,
  updateSalaryAdvanceStatus,
} from "../handlers/payroll";

jest.mock("@hrms/db", () => {
  const _db: any = {
    payrollRun: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    payrollLineItem: {
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    salaryAdvance: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    salaryStructure: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    notification: { create: jest.fn() },
    notificationRecipient: { createMany: jest.fn() },
    payoutTenantIndex: { upsert: jest.fn() },
  };
  return { prismaWithTenant: _db, getTenantId: jest.fn(() => "t1") };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    CREATED: 201,
    ACCEPTED: 202,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
  },
  deriveFromComponents: jest.fn(),
}));

const mockPayrollDisbursementQueueAdd = jest
  .fn()
  .mockResolvedValue({ id: "job-1" });
jest.mock("@hrms/queue", () => ({
  getPayrollDisbursementQueue: jest.fn(() => ({
    add: mockPayrollDisbursementQueueAdd,
  })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// payroll.ts imports getActiveSettings from ./tenantSettings, which imports
// the real @hrms/cache (ioredis) at module load — without this mock, a
// Redis connection attempt against a nonexistent local instance hangs the
// whole test file (same issue documented in payrollHandlers.test.ts and
// tdsWorksheet.test.ts).
jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

jest.mock("../utils/webhookEmitter", () => ({
  emitWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

const db: any = prisma;

function makeReq(overrides: any = {}) {
  return {
    user: { userId: "u1", tenantId: "t1", tenantRole: "owner" },
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as any;
}
function makeRes() {
  return { json: jest.fn() } as any;
}
const EMPLOYEE = {
  user: { userId: "u1", tenantId: "t1", tenantRole: "member" },
};

describe("payroll run lifecycle handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RAZORPAY_X_KEY_ID;
    delete process.env.RAZORPAY_X_KEY_SECRET;
    delete process.env.RAZORPAY_X_ACCOUNT_NUMBER;
    db.user.findUnique.mockResolvedValue({ isSuperUser: false });
  });

  describe("listPayrollRuns", () => {
    it("returns FORBIDDEN for a non-HR employee", async () => {
      const req = makeReq(EMPLOYEE);
      const res = makeRes();
      await listPayrollRuns(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("resolves a bare 4-digit search term to a year filter", async () => {
      db.payrollRun.findMany.mockResolvedValue([]);
      db.payrollRun.count.mockResolvedValue(0);
      const req = makeReq({ query: { search: "2026" } });
      const res = makeRes();
      await listPayrollRuns(req, res);
      expect(db.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ year: 2026 }),
        }),
      );
    });

    it("resolves a month name search term to a month filter", async () => {
      db.payrollRun.findMany.mockResolvedValue([]);
      db.payrollRun.count.mockResolvedValue(0);
      const req = makeReq({ query: { search: "March" } });
      const res = makeRes();
      await listPayrollRuns(req, res);
      expect(db.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ month: 3 }),
        }),
      );
    });

    it("resolves a combined 'month year' search term to both filters", async () => {
      db.payrollRun.findMany.mockResolvedValue([]);
      db.payrollRun.count.mockResolvedValue(0);
      const req = makeReq({ query: { search: "Mar 2026" } });
      const res = makeRes();
      await listPayrollRuns(req, res);
      expect(db.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ month: 3, year: 2026 }),
        }),
      );
    });

    it("falls back to a notes contains-search for an unparseable term", async () => {
      db.payrollRun.findMany.mockResolvedValue([]);
      db.payrollRun.count.mockResolvedValue(0);
      const req = makeReq({ query: { search: "urgent fix" } });
      const res = makeRes();
      await listPayrollRuns(req, res);
      expect(db.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            notes: { contains: "urgent fix", mode: "insensitive" },
          }),
        }),
      );
    });
  });

  describe("getPayrollRun", () => {
    it("returns NOT_FOUND for a run outside the tenant", async () => {
      db.payrollRun.findFirst.mockResolvedValue(null);
      const req = makeReq({ params: { runId: "r1" } });
      const res = makeRes();
      await getPayrollRun(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("enriches each line item with the employee's name", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        lineItems: [{ userId: "u2", netPayable: 50000 }],
      });
      db.user.findMany.mockResolvedValue([{ id: "u2", username: "jdoe" }]);
      const req = makeReq({ params: { runId: "r1" } });
      const res = makeRes();
      await getPayrollRun(req, res);
      const data = (res.json.mock.calls[0][0] as any).data;
      expect(data.lineItems[0].employee).toEqual({
        id: "u2",
        username: "jdoe",
      });
    });
  });

  describe("updatePayrollRunStatus — validation", () => {
    it("returns BAD_REQUEST for an unrecognized target status", async () => {
      const req = makeReq({ body: { runId: "r1", status: "bogus" } });
      const res = makeRes();
      await updatePayrollRunStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("returns NOT_FOUND for a run outside the tenant", async () => {
      db.payrollRun.findFirst.mockResolvedValue(null);
      const req = makeReq({ body: { runId: "r1", status: "processing" } });
      const res = makeRes();
      await updatePayrollRunStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("rejects an invalid state transition (e.g. approving a draft run)", async () => {
      db.payrollRun.findFirst.mockResolvedValue({ id: "r1", status: "draft" });
      const req = makeReq({ body: { runId: "r1", status: "approved" } });
      const res = makeRes();
      await updatePayrollRunStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("Cannot approve"),
        }),
      );
    });

    it("returns FORBIDDEN when the caller's role isn't allowed for this transition", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "approved",
      });
      const req = makeReq({
        user: { userId: "u1", tenantId: "t1", tenantRole: "hr" }, // disburse requires owner/admin
        body: { runId: "r1", status: "disbursed" },
      });
      const res = makeRes();
      await updatePayrollRunStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("enforces four-eyes: the initiator cannot approve their own run", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "processing",
        initiatedBy: "u1",
      });
      db.user.findUnique.mockResolvedValue({ isSuperUser: false });
      const req = makeReq({ body: { runId: "r1", status: "approved" } });
      const res = makeRes();
      await updatePayrollRunStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          message: expect.stringContaining("four-eyes"),
        }),
      );
      expect(db.payrollRun.update).not.toHaveBeenCalled();
    });

    it("allows a superuser initiator to bypass the four-eyes restriction", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "processing",
        initiatedBy: "u1",
      });
      db.user.findUnique.mockResolvedValue({ isSuperUser: true });
      db.payrollRun.update.mockResolvedValue({});
      const req = makeReq({ body: { runId: "r1", status: "approved" } });
      const res = makeRes();
      await updatePayrollRunStatus(req, res);
      expect(db.payrollRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "approved" }),
        }),
      );
    });

    it("submits a draft run to processing", async () => {
      db.payrollRun.findFirst.mockResolvedValue({ id: "r1", status: "draft" });
      db.payrollRun.update.mockResolvedValue({});
      const req = makeReq({ body: { runId: "r1", status: "processing" } });
      const res = makeRes();
      await updatePayrollRunStatus(req, res);
      expect(db.payrollRun.update).toHaveBeenCalledWith({
        where: { id: "r1", status: "draft" },
        data: { status: "processing" },
      });
      expect(emitWebhookEvent).not.toHaveBeenCalled();
    });

    it("returns CONFLICT when the run's status changed concurrently (lost the CAS race)", async () => {
      db.payrollRun.findFirst.mockResolvedValue({ id: "r1", status: "draft" });
      db.payrollRun.update.mockRejectedValue(
        Object.assign(new Error("no record"), { code: "P2025" }),
      );
      const req = makeReq({ body: { runId: "r1", status: "processing" } });
      const res = makeRes();
      await updatePayrollRunStatus(req, res);
      expect(db.payrollRun.update).toHaveBeenCalledWith({
        where: { id: "r1", status: "draft" },
        data: { status: "processing" },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 409 }),
      );
    });

    it("emits a webhook on approval", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "processing",
        initiatedBy: "someone-else",
      });
      db.payrollRun.update.mockResolvedValue({});
      const req = makeReq({ body: { runId: "r1", status: "approved" } });
      const res = makeRes();
      await updatePayrollRunStatus(req, res);
      expect(emitWebhookEvent).toHaveBeenCalledWith(
        "payroll.approved",
        expect.objectContaining({ runId: "r1" }),
      );
    });

    it("allows any of owner/admin/hr/cancel-eligible role to cancel a processing run", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "processing",
      });
      db.payrollRun.update.mockResolvedValue({});
      const req = makeReq({ body: { runId: "r1", status: "cancelled" } });
      const res = makeRes();
      await updatePayrollRunStatus(req, res);
      expect(db.payrollRun.update).toHaveBeenCalledWith({
        where: { id: "r1", status: "processing" },
        data: { status: "cancelled" },
      });
    });
  });

  describe("updatePayrollRunStatus — disburse (now enqueues a background job)", () => {
    // The actual RazorpayX payout loop, advance reconciliation, and payslip
    // generation moved to payrollDisbursement.ts/payrollDisbursementWorker.ts
    // (see payrollDisbursement.test.ts and payrollDisbursementWorker.test.ts)
    // — this handler's only remaining job for "disburse" is the pre-flight
    // bank-details check, the CAS status update to "disbursing", and
    // enqueueing the job.
    beforeEach(() => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "approved",
        month: 6,
        year: 2024,
        employeeCount: 2,
      });
      db.payrollRun.update.mockResolvedValue({});
    });

    it("moves the run to 'disbursing' and enqueues the disbursement job, returning 202", async () => {
      const req = makeReq({ body: { runId: "r1", status: "disbursed" } });
      const res = makeRes();

      await updatePayrollRunStatus(req, res);

      expect(db.payrollRun.update).toHaveBeenCalledWith({
        where: { id: "r1", status: "approved" },
        data: { status: "disbursing" },
      });
      expect(mockPayrollDisbursementQueueAdd).toHaveBeenCalledWith("disburse", {
        tenantId: "t1",
        runId: "r1",
        disbursedBy: "u1",
      });
      expect(emitWebhookEvent).not.toHaveBeenCalled(); // fires from the worker instead
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 202,
          data: { runId: "r1", status: "disbursing" },
        }),
      );
    });

    it("rolls the run back to 'approved' and returns 500 when enqueueing the disbursement job fails", async () => {
      mockPayrollDisbursementQueueAdd.mockRejectedValueOnce(
        new Error("Redis connection lost"),
      );
      const req = makeReq({ body: { runId: "r1", status: "disbursed" } });
      const res = makeRes();

      await updatePayrollRunStatus(req, res);

      // First call: CAS to "disbursing". Second call: rollback to "approved"
      // after the enqueue failed — without this, the run would be stranded
      // in "disbursing" with no job ever created to move it out.
      expect(db.payrollRun.update).toHaveBeenNthCalledWith(1, {
        where: { id: "r1", status: "approved" },
        data: { status: "disbursing" },
      });
      expect(db.payrollRun.update).toHaveBeenNthCalledWith(2, {
        where: { id: "r1", status: "disbursing" },
        data: { status: "approved" },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500 }),
      );
    });

    it("blocks disburse pre-flight when RazorpayX is configured and an employee is missing bank details", async () => {
      process.env.RAZORPAY_X_KEY_ID = "key";
      db.payrollLineItem.findMany.mockResolvedValueOnce([{ userId: "u2" }]);
      db.user.findMany.mockResolvedValue([
        { id: "u2", username: "jdoe", bank_account_no: null, ifsc_code: null },
      ]);
      const req = makeReq({ body: { runId: "r1", status: "disbursed" } });
      const res = makeRes();

      await updatePayrollRunStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("missing bank account details"),
        }),
      );
      expect(db.payrollRun.update).not.toHaveBeenCalled();
      expect(mockPayrollDisbursementQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe("retryFailedPayouts", () => {
    it("returns FORBIDDEN for a caller without owner/admin rights", async () => {
      const req = makeReq({
        ...EMPLOYEE,
        params: { runId: "r1" },
      });
      const res = makeRes();
      await retryFailedPayouts(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns NOT_FOUND for a run outside the tenant", async () => {
      db.payrollRun.findFirst.mockResolvedValue(null);
      const req = makeReq({ params: { runId: "r1" } });
      const res = makeRes();
      await retryFailedPayouts(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it.each(["draft", "processing", "approved", "disbursing", "cancelled"])(
      "rejects retrying a run with status '%s'",
      async (status) => {
        db.payrollRun.findFirst.mockResolvedValue({ id: "r1", status });
        const req = makeReq({ params: { runId: "r1" } });
        const res = makeRes();
        await retryFailedPayouts(req, res);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ status: 400 }),
        );
        expect(mockPayrollDisbursementQueueAdd).not.toHaveBeenCalled();
      },
    );

    it("returns BAD_REQUEST when every line item's payout already completed", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "disbursed",
      });
      db.payrollLineItem.count.mockResolvedValue(0);
      const req = makeReq({ params: { runId: "r1" } });
      const res = makeRes();
      await retryFailedPayouts(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("Nothing to retry"),
        }),
      );
      expect(mockPayrollDisbursementQueueAdd).not.toHaveBeenCalled();
    });

    it("distinguishes 'nothing outstanding but some permanently failed' from a genuinely fully-completed run", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "disbursed",
      });
      // First count() call (outstanding: failed/null/pending) → 0.
      // Second count() call (permanently_failed) → 2.
      db.payrollLineItem.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2);
      const req = makeReq({ params: { runId: "r1" } });
      const res = makeRes();
      await retryFailedPayouts(req, res);

      expect(db.payrollLineItem.count).toHaveBeenNthCalledWith(2, {
        where: { payrollRunId: "r1", payoutStatus: "permanently_failed" },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("permanently failed"),
          data: { permanentlyFailed: 2 },
        }),
      );
      // Must NOT use the original blanket "Nothing to retry" phrasing, which
      // would wrongly read as "this run is entirely fine" when 2 employees
      // never actually got paid and the run needs manual attention.
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Nothing to retry"),
        }),
      );
      expect(mockPayrollDisbursementQueueAdd).not.toHaveBeenCalled();
    });

    it("enqueues the disbursement job for a 'disbursed' run with outstanding failed payouts", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "disbursed",
      });
      db.payrollRun.update.mockResolvedValue({});
      db.payrollLineItem.count.mockResolvedValue(2);
      const req = makeReq({ params: { runId: "r1" } });
      const res = makeRes();
      await retryFailedPayouts(req, res);

      expect(db.payrollLineItem.count).toHaveBeenCalledWith({
        where: {
          payrollRunId: "r1",
          OR: [
            { payoutStatus: "failed" },
            { payoutStatus: null },
            { payoutStatus: "pending" },
          ],
        },
      });
      // CAS to "disbursing" before enqueue — closes the cross-instance
      // double-enqueue race (two concurrent retry calls would otherwise
      // both pass the retryableStatuses check above).
      expect(db.payrollRun.update).toHaveBeenCalledWith({
        where: { id: "r1", status: "disbursed" },
        data: { status: "disbursing" },
      });
      expect(mockPayrollDisbursementQueueAdd).toHaveBeenCalledWith("disburse", {
        tenantId: "t1",
        runId: "r1",
        disbursedBy: "u1",
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 202 }),
      );
    });

    it("also allows retrying a run whose background job failed entirely ('disbursement_failed')", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "disbursement_failed",
      });
      db.payrollRun.update.mockResolvedValue({});
      db.payrollLineItem.count.mockResolvedValue(5);
      const req = makeReq({ params: { runId: "r1" } });
      const res = makeRes();
      await retryFailedPayouts(req, res);
      expect(mockPayrollDisbursementQueueAdd).toHaveBeenCalled();
    });

    it("returns CONFLICT when a concurrent retry already claimed the run (lost the CAS race)", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "disbursed",
      });
      db.payrollLineItem.count.mockResolvedValue(2);
      const p2025 = Object.assign(new Error("not found"), { code: "P2025" });
      db.payrollRun.update.mockRejectedValueOnce(p2025);
      const req = makeReq({ params: { runId: "r1" } });
      const res = makeRes();
      await retryFailedPayouts(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 409 }),
      );
      expect(mockPayrollDisbursementQueueAdd).not.toHaveBeenCalled();
    });

    it("rolls the run back to its previous status and returns 500 when enqueueing the retry job fails", async () => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "disbursement_failed",
      });
      db.payrollLineItem.count.mockResolvedValue(2);
      db.payrollRun.update.mockResolvedValue({});
      mockPayrollDisbursementQueueAdd.mockRejectedValueOnce(
        new Error("Redis connection lost"),
      );
      const req = makeReq({ params: { runId: "r1" } });
      const res = makeRes();
      await retryFailedPayouts(req, res);

      expect(db.payrollRun.update).toHaveBeenNthCalledWith(1, {
        where: { id: "r1", status: "disbursement_failed" },
        data: { status: "disbursing" },
      });
      expect(db.payrollRun.update).toHaveBeenNthCalledWith(2, {
        where: { id: "r1", status: "disbursing" },
        data: { status: "disbursement_failed" },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500 }),
      );
    });
  });

  describe("requestSalaryAdvance", () => {
    it("returns CONFLICT when the employee already has an active advance", async () => {
      db.salaryAdvance.findFirst.mockResolvedValue({
        id: "adv1",
        status: "Pending",
      });
      const req = makeReq({
        body: { amount: 10000, reason: "x", emiMonths: 5 },
      });
      const res = makeRes();
      await requestSalaryAdvance(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 409 }),
      );
      expect(db.salaryAdvance.create).not.toHaveBeenCalled();
    });

    it("computes the EMI amount and creates the advance", async () => {
      db.salaryAdvance.findFirst.mockResolvedValue(null);
      db.salaryAdvance.create.mockResolvedValue({ id: "adv1" });
      const req = makeReq({
        body: { amount: 10000, reason: "medical", emiMonths: 4 },
      });
      const res = makeRes();
      await requestSalaryAdvance(req, res);
      expect(db.salaryAdvance.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: 10000,
          emiAmount: 2500,
          remainingAmount: 10000,
          status: "Pending",
        }),
      });
    });
  });

  describe("listSalaryAdvances", () => {
    it("scopes a non-privileged employee to their own advances", async () => {
      db.salaryAdvance.findMany.mockResolvedValue([]);
      db.salaryAdvance.count.mockResolvedValue(0);
      db.user.findMany.mockResolvedValue([]);
      const req = makeReq(EMPLOYEE);
      const res = makeRes();
      await listSalaryAdvances(req, res);
      expect(db.salaryAdvance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1" } }),
      );
    });

    it("allows a privileged user to search by employee name", async () => {
      db.user.findMany
        .mockResolvedValueOnce([{ id: "u2" }])
        .mockResolvedValueOnce([]);
      db.salaryAdvance.findMany.mockResolvedValue([]);
      db.salaryAdvance.count.mockResolvedValue(0);
      const req = makeReq({ query: { search: "jane" } });
      const res = makeRes();
      await listSalaryAdvances(req, res);
      expect(db.salaryAdvance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: { in: ["u2"] } } }),
      );
    });
  });

  describe("updateSalaryAdvanceStatus", () => {
    it("returns FORBIDDEN for a caller without approval rights", async () => {
      const req = makeReq({
        ...EMPLOYEE,
        body: { advanceId: "adv1", action: "approve" },
      });
      const res = makeRes();
      await updateSalaryAdvanceStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("allows a member with the SalaryManagement:approve_advance grant", async () => {
      db.user.findUnique
        .mockResolvedValueOnce({ isSuperUser: false })
        .mockResolvedValueOnce({
          permissions: ["SalaryManagement:approve_advance"],
        });
      db.salaryAdvance.findFirst.mockResolvedValue({
        id: "adv1",
        status: "Pending",
        amount: 10000,
      });
      db.salaryAdvance.update.mockResolvedValue({});
      const req = makeReq({
        ...EMPLOYEE,
        body: { advanceId: "adv1", action: "approve" },
      });
      const res = makeRes();
      await updateSalaryAdvanceStatus(req, res);
      expect(db.salaryAdvance.update).toHaveBeenCalled();
    });

    it("returns NOT_FOUND for an advance outside the tenant", async () => {
      db.salaryAdvance.findFirst.mockResolvedValue(null);
      const req = makeReq({ body: { advanceId: "adv1", action: "approve" } });
      const res = makeRes();
      await updateSalaryAdvanceStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("rejects updating an advance that isn't Pending", async () => {
      db.salaryAdvance.findFirst.mockResolvedValue({
        id: "adv1",
        status: "Approved",
      });
      const req = makeReq({ body: { advanceId: "adv1", action: "approve" } });
      const res = makeRes();
      await updateSalaryAdvanceStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("recomputes emiMonths when HR overrides the EMI amount on approval", async () => {
      db.salaryAdvance.findFirst.mockResolvedValue({
        id: "adv1",
        status: "Pending",
        amount: 10000,
      });
      db.salaryAdvance.update.mockResolvedValue({});
      const req = makeReq({
        body: { advanceId: "adv1", action: "approve", emiAmount: 2000 },
      });
      const res = makeRes();
      await updateSalaryAdvanceStatus(req, res);
      expect(db.salaryAdvance.update).toHaveBeenCalledWith({
        where: { id: "adv1", status: "Pending" },
        data: expect.objectContaining({
          status: "Approved",
          emiAmount: 2000,
          emiMonths: 5,
        }),
      });
    });

    it("rejects an advance without touching EMI fields", async () => {
      db.salaryAdvance.findFirst.mockResolvedValue({
        id: "adv1",
        status: "Pending",
        amount: 10000,
      });
      db.salaryAdvance.update.mockResolvedValue({});
      const req = makeReq({ body: { advanceId: "adv1", action: "reject" } });
      const res = makeRes();
      await updateSalaryAdvanceStatus(req, res);
      expect(db.salaryAdvance.update).toHaveBeenCalledWith({
        where: { id: "adv1", status: "Pending" },
        data: { status: "Rejected" },
      });
    });

    it("returns CONFLICT when the advance's status changed concurrently (lost the CAS race)", async () => {
      db.salaryAdvance.findFirst.mockResolvedValue({
        id: "adv1",
        status: "Pending",
        amount: 10000,
      });
      db.salaryAdvance.update.mockRejectedValue(
        Object.assign(new Error("no record"), { code: "P2025" }),
      );
      const req = makeReq({ body: { advanceId: "adv1", action: "reject" } });
      const res = makeRes();
      await updateSalaryAdvanceStatus(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 409 }),
      );
    });
  });
});
