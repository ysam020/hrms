import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { emitWebhookEvent } from "../utils/webhookEmitter";
import {
  listPayrollRuns,
  getPayrollRun,
  updatePayrollRunStatus,
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
    payrollLineItem: { findMany: jest.fn(), update: jest.fn() },
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
    },
    notification: { create: jest.fn() },
    notificationRecipient: { createMany: jest.fn() },
    payoutTenantIndex: { create: jest.fn() },
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
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
  },
  deriveFromComponents: jest.fn(),
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
        where: { id: "r1" },
        data: { status: "processing" },
      });
      expect(emitWebhookEvent).not.toHaveBeenCalled();
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
        where: { id: "r1" },
        data: { status: "cancelled" },
      });
    });
  });

  describe("updatePayrollRunStatus — disburse (flag-only, no RazorpayX configured)", () => {
    beforeEach(() => {
      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "approved",
        month: 6,
        year: 2024,
        employeeCount: 2,
      });
      db.payrollRun.update.mockResolvedValue({});
      db.payrollLineItem.findMany.mockResolvedValue([
        {
          id: "li1",
          userId: "u2",
          grossSalary: 60000,
          netPayable: 55000,
          advanceDeduction: 0,
          totalDeductions: 5000,
        },
        {
          id: "li2",
          userId: "u3",
          grossSalary: 40000,
          netPayable: 37000,
          advanceDeduction: 0,
          totalDeductions: 3000,
        },
      ]);
      db.salaryStructure.findFirst.mockResolvedValue(null);
      db.salaryStructure.create.mockResolvedValue({});
      db.notification.create.mockResolvedValue({ id: "notif1" });
      db.notificationRecipient.createMany.mockResolvedValue({});
    });

    it("generates a payslip snapshot per employee and broadcasts a notification", async () => {
      const req = makeReq({ body: { runId: "r1", status: "disbursed" } });
      const res = makeRes();

      await updatePayrollRunStatus(req, res);

      expect(db.salaryStructure.create).toHaveBeenCalledTimes(2);
      expect(db.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: "payroll" }),
        }),
      );
      expect(db.notificationRecipient.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ notificationId: "notif1", userId: "u2" }),
          expect.objectContaining({ notificationId: "notif1", userId: "u3" }),
        ],
      });
      expect(emitWebhookEvent).toHaveBeenCalledWith(
        "payroll.disbursed",
        expect.objectContaining({ runId: "r1" }),
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Payslips generated"),
        }),
      );
    });

    it("updates an existing SalaryStructure row instead of creating a duplicate", async () => {
      db.salaryStructure.findFirst
        .mockResolvedValueOnce({ id: "ss1" })
        .mockResolvedValueOnce(null);
      db.salaryStructure.update.mockResolvedValue({});
      const req = makeReq({ body: { runId: "r1", status: "disbursed" } });
      const res = makeRes();

      await updatePayrollRunStatus(req, res);

      expect(db.salaryStructure.update).toHaveBeenCalledWith({
        where: { id: "ss1" },
        data: expect.objectContaining({ userId: "u2" }),
      });
    });

    it("reconciles a salary advance repayment when advanceDeduction is present", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        {
          id: "li1",
          userId: "u2",
          grossSalary: 60000,
          netPayable: 50000,
          advanceDeduction: 5000,
          totalDeductions: 10000,
        },
      ]);
      db.salaryAdvance.findFirst.mockResolvedValue({
        id: "adv1",
        paidMonths: 1,
        remainingAmount: 5000,
        emiMonths: 2,
      });
      db.salaryAdvance.update.mockResolvedValue({});
      const req = makeReq({ body: { runId: "r1", status: "disbursed" } });
      const res = makeRes();

      await updatePayrollRunStatus(req, res);

      expect(db.salaryAdvance.update).toHaveBeenCalledWith({
        where: { id: "adv1" },
        data: { paidMonths: 2, remainingAmount: 0, status: "Repaid" },
      });
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
    });
  });

  describe("updatePayrollRunStatus — disburse via RazorpayX", () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
      process.env.RAZORPAY_X_KEY_ID = "key_id";
      process.env.RAZORPAY_X_KEY_SECRET = "key_secret";
      process.env.RAZORPAY_X_ACCOUNT_NUMBER = "acc123";

      db.payrollRun.findFirst.mockResolvedValue({
        id: "r1",
        status: "approved",
        month: 6,
        year: 2024,
        employeeCount: 1,
      });
      db.payrollRun.update.mockResolvedValue({});
      db.payrollLineItem.findMany
        .mockResolvedValueOnce([{ userId: "u2" }]) // pre-flight check
        .mockResolvedValueOnce([
          {
            id: "li1",
            userId: "u2",
            grossSalary: 60000,
            netPayable: 55000,
            advanceDeduction: 0,
            totalDeductions: 5000,
          },
        ]); // main disburse loop
      db.user.findMany.mockResolvedValue([
        {
          id: "u2",
          username: "jdoe",
          first_name: "Jane",
          last_name: "Doe",
          bank_account_no: "123456",
          ifsc_code: "HDFC0001",
        },
      ]);
      db.payoutTenantIndex.create.mockResolvedValue({});
      db.payrollLineItem.update.mockResolvedValue({});
      db.salaryStructure.findFirst.mockResolvedValue(null);
      db.salaryStructure.create.mockResolvedValue({});
      db.notification.create.mockResolvedValue({ id: "notif1" });
      db.notificationRecipient.createMany.mockResolvedValue({});

      fetchMock = jest.fn();
      (global as any).fetch = fetchMock;
    });

    it("creates a RazorpayX contact, fund account, and payout, then indexes the payout for the webhook to resolve", async () => {
      fetchMock
        // getOrCreateRzpContact: list (empty) then create
        .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 0 }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "contact_1" }),
        })
        // createRzpFundAccount
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "fa_1" }) })
        // createRzpPayout
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "payout_1", status: "processing" }),
        });

      const req = makeReq({ body: { runId: "r1", status: "disbursed" } });
      const res = makeRes();

      await updatePayrollRunStatus(req, res);

      expect(db.payoutTenantIndex.create).toHaveBeenCalledWith({
        data: { payoutId: "payout_1", tenantId: "t1" },
      });
      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: expect.objectContaining({
          payoutId: "payout_1",
          payoutStatus: "processing",
        }),
      });
    });

    it("reuses an existing RazorpayX contact instead of creating a new one", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ count: 1, items: [{ id: "existing_contact" }] }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "fa_1" }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "payout_1", status: "processing" }),
        });

      const req = makeReq({ body: { runId: "r1", status: "disbursed" } });
      const res = makeRes();

      await updatePayrollRunStatus(req, res);

      expect(fetchMock).toHaveBeenCalledTimes(3); // no create-contact call
    });

    it("marks the line item payout failed (not the whole request) when RazorpayX rejects the payout", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ count: 1, items: [{ id: "c1" }] }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "fa_1" }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            error: { description: "Insufficient balance" },
          }),
        });

      const req = makeReq({ body: { runId: "r1", status: "disbursed" } });
      const res = makeRes();

      await updatePayrollRunStatus(req, res);

      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: expect.objectContaining({
          payoutStatus: "failed",
          payoutFailureReason: "Insufficient balance",
        }),
      });
      // The overall run status still transitions — RazorpayX failures don't block disbursement.
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 200 }),
      );
    });

    it("skips the payout (and doesn't call RazorpayX) for a zero net-payable line item", async () => {
      db.payrollLineItem.findMany
        .mockReset()
        .mockResolvedValueOnce([{ userId: "u2" }])
        .mockResolvedValueOnce([
          {
            id: "li1",
            userId: "u2",
            grossSalary: 5000,
            netPayable: 0,
            advanceDeduction: 5000,
            totalDeductions: 5000,
          },
        ]);

      const req = makeReq({ body: { runId: "r1", status: "disbursed" } });
      const res = makeRes();

      await updatePayrollRunStatus(req, res);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: expect.objectContaining({ payoutStatus: "skipped" }),
      });
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
        where: { id: "adv1" },
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
        where: { id: "adv1" },
        data: { status: "Rejected" },
      });
    });
  });
});
