import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { runPayrollDisbursement } from "../services/payrollDisbursement";

jest.mock("@hrms/db", () => {
  const _db: any = {
    payrollRun: { findFirst: jest.fn() },
    payrollLineItem: { findMany: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
    salaryAdvance: { findFirst: jest.fn(), update: jest.fn() },
    notification: { create: jest.fn() },
    notificationRecipient: { createMany: jest.fn() },
    payoutTenantIndex: { upsert: jest.fn() },
    tenant: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  return {
    prismaWithTenant: _db,
    prisma: _db,
    getTenantId: jest.fn(() => "t1"),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("@hrms/common", () => ({
  tenantFrom: jest.fn(
    (name: string) => `"${name} HR" <hr@notifications.praesto.in>`,
  ),
  tenantReplyTo: jest.fn((email?: string | null) => email || undefined),
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
}));

jest.mock("../handlers/salary", () => ({
  buildSalarySlipPdf: jest
    .fn()
    .mockResolvedValue({ error: "not under test", status: "NOT_FOUND" }),
}));

const db: any = prisma;

function baseLineItem(overrides: any = {}) {
  return {
    id: "li1",
    userId: "u2",
    grossSalary: 60000,
    netPayable: 55000,
    advanceDeduction: 0,
    totalDeductions: 5000,
    payoutStatus: null,
    postProcessed: false,
    ...overrides,
  };
}

describe("runPayrollDisbursement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RAZORPAY_X_KEY_ID;
    delete process.env.RAZORPAY_X_KEY_SECRET;
    delete process.env.RAZORPAY_X_ACCOUNT_NUMBER;
    (getTenantId as jest.Mock).mockReturnValue("t1");

    db.payrollRun.findFirst.mockResolvedValue({
      id: "r1",
      month: 6,
      year: 2024,
    });
    db.notification.create.mockResolvedValue({ id: "notif1" });
    db.notificationRecipient.createMany.mockResolvedValue({});
    db.payrollLineItem.update.mockResolvedValue({});
  });

  it("throws when the run doesn't exist", async () => {
    db.payrollRun.findFirst.mockResolvedValue(null);
    await expect(runPayrollDisbursement("missing")).rejects.toThrow(
      /not found/,
    );
  });

  describe("flag-only mode (no RazorpayX configured)", () => {
    it("post-processes each employee and broadcasts one batched notification", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ id: "li1", userId: "u2" }),
        baseLineItem({ id: "li2", userId: "u3" }),
      ]);

      const summary = await runPayrollDisbursement("r1");

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
      expect(summary.postProcessed).toBe(2);
    });

    it("marks the line item postProcessed after reconciliation+payslip generation", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([baseLineItem()]);

      await runPayrollDisbursement("r1");

      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: { postProcessed: true },
      });
    });

    it("reconciles a salary advance repayment when advanceDeduction is present", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ advanceDeduction: 5000, netPayable: 50000 }),
      ]);
      db.salaryAdvance.findFirst.mockResolvedValue({
        id: "adv1",
        paidMonths: 1,
        remainingAmount: 5000,
        emiMonths: 2,
      });
      db.salaryAdvance.update.mockResolvedValue({});

      await runPayrollDisbursement("r1");

      expect(db.salaryAdvance.update).toHaveBeenCalledWith({
        where: { id: "adv1" },
        data: { paidMonths: 2, remainingAmount: 0, status: "Repaid" },
      });
    });
  });

  describe("resumability", () => {
    it("skips advance reconciliation + payslip generation for items already postProcessed", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ id: "li1", userId: "u2", postProcessed: true }),
        baseLineItem({ id: "li2", userId: "u3", postProcessed: false }),
      ]);

      const summary = await runPayrollDisbursement("r1");

      expect(summary.alreadyDone).toBe(0); // payoutStatus-based, not postProcessed-based
      expect(summary.postProcessed).toBe(1);
    });

    it("only notifies employees newly post-processed in this call, not ones already done", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ id: "li1", userId: "u2", postProcessed: true }),
        baseLineItem({ id: "li2", userId: "u3", postProcessed: false }),
      ]);

      await runPayrollDisbursement("r1");

      expect(db.notificationRecipient.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ userId: "u3" })],
      });
    });

    it("does not create a notification at all when every item was already postProcessed", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ postProcessed: true }),
      ]);

      await runPayrollDisbursement("r1");

      expect(db.notification.create).not.toHaveBeenCalled();
    });
  });

  describe("RazorpayX payouts", () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
      process.env.RAZORPAY_X_KEY_ID = "key_id";
      process.env.RAZORPAY_X_KEY_SECRET = "key_secret";
      process.env.RAZORPAY_X_ACCOUNT_NUMBER = "acc123";

      db.user.findMany.mockResolvedValue([
        {
          id: "u2",
          first_name: "Jane",
          last_name: "Doe",
          username: "jdoe",
          bank_account_no: "123456",
          ifsc_code: "HDFC0001",
        },
      ]);
      db.payoutTenantIndex.upsert.mockResolvedValue({});

      fetchMock = jest.fn();
      (global as any).fetch = fetchMock;
    });

    it("creates a RazorpayX contact, fund account, and payout, then indexes the payout for the webhook to resolve", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([baseLineItem()]);
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 0 }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "contact_1" }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "fa_1" }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "payout_1", status: "processing" }),
        });

      const summary = await runPayrollDisbursement("r1");

      expect(db.payoutTenantIndex.upsert).toHaveBeenCalledWith({
        where: { payoutId: "payout_1" },
        create: { payoutId: "payout_1", tenantId: "t1" },
        update: {},
      });
      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: expect.objectContaining({
          payoutId: "payout_1",
          payoutStatus: "processing",
        }),
      });
      expect(summary.payoutOk).toBe(1);
    });

    it("still records the payout and marks it processing when the index row already exists (crash-window resume: idempotency key returned the same payout, index upsert is a no-op)", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([baseLineItem()]);
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 0 }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "contact_1" }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "fa_1" }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "payout_1", status: "processing" }),
        });
      // Simulates the index row already existing from a crashed prior
      // attempt — upsert resolves normally instead of throwing P2002.
      db.payoutTenantIndex.upsert.mockResolvedValue({
        id: "idx1",
        payoutId: "payout_1",
        tenantId: "t1",
      });

      const summary = await runPayrollDisbursement("r1");

      expect(summary.payoutOk).toBe(1);
      expect(summary.payoutFail).toBe(0);
      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: expect.objectContaining({ payoutStatus: "processing" }),
      });
    });

    it("marks the line item payout failed (not the whole call) when RazorpayX rejects the payout", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([baseLineItem()]);
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

      const summary = await runPayrollDisbursement("r1");

      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: expect.objectContaining({
          payoutStatus: "failed",
          payoutFailureReason: "Insufficient balance",
        }),
      });
      expect(summary.payoutFail).toBe(1);
      // Post-processing (advance/notification) must NOT run for a failed
      // payout — an employee whose bank transfer failed must not have their
      // advance balance reduced or get a "Salary Disbursed" notification.
      expect(db.notification.create).not.toHaveBeenCalled();
      expect(db.payrollLineItem.update).not.toHaveBeenCalledWith({
        where: { id: "li1" },
        data: { postProcessed: true },
      });
    });

    it("escalates to the permanently_failed terminal state once a payout exhausts its attempt budget", async () => {
      // Already failed 4 times — this is the 5th (MAX_PAYOUT_ATTEMPTS).
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ payoutStatus: "failed", payoutAttempts: 4 }),
      ]);
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

      const summary = await runPayrollDisbursement("r1");

      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: expect.objectContaining({
          payoutStatus: "permanently_failed",
          payoutAttempts: 5,
          payoutFailureReason: expect.stringContaining("exhausted"),
        }),
      });
      expect(summary.payoutPermanentlyFailed).toBe(1);
      expect(summary.payoutFail).toBe(0);
    });

    it("does not retry a permanently_failed line item on a later pass", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({
          payoutStatus: "permanently_failed",
          payoutAttempts: 5,
        }),
      ]);

      const summary = await runPayrollDisbursement("r1");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(summary.alreadyDone).toBe(1);
      expect(summary.payoutOk).toBe(0);
      expect(summary.payoutFail).toBe(0);
      expect(summary.payoutPermanentlyFailed).toBe(0); // not re-counted on a pass where it wasn't (re-)decided
    });

    it("never post-processes a permanently_failed line item — no advance decrement, payslip, or notification", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({
          payoutStatus: "permanently_failed",
          payoutAttempts: 5,
          advanceDeduction: 5000,
          postProcessed: false,
        }),
      ]);

      await runPayrollDisbursement("r1");

      expect(db.salaryAdvance.findFirst).not.toHaveBeenCalled();
      expect(db.notification.create).not.toHaveBeenCalled();
      expect(db.payrollLineItem.update).not.toHaveBeenCalledWith({
        where: { id: "li1" },
        data: { postProcessed: true },
      });
    });

    it("escalates the missing-bank-details failure path to permanently_failed the same way", async () => {
      db.user.findMany.mockResolvedValue([
        { id: "u2", first_name: "Jane", last_name: "Doe", username: "jdoe" }, // no bank_account_no/ifsc_code
      ]);
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ payoutStatus: "failed", payoutAttempts: 4 }),
      ]);

      const summary = await runPayrollDisbursement("r1");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: expect.objectContaining({
          payoutStatus: "permanently_failed",
          payoutAttempts: 5,
        }),
      });
      expect(summary.payoutPermanentlyFailed).toBe(1);
    });

    it("skips the payout (no RazorpayX calls) for a zero net-payable line item", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ netPayable: 0 }),
      ]);

      const summary = await runPayrollDisbursement("r1");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: expect.objectContaining({ payoutStatus: "skipped" }),
      });
      expect(summary.payoutSkipped).toBe(1);
    });

    it("does not re-attempt RazorpayX for a line item whose payout already succeeded in a previous attempt", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ payoutStatus: "processed" }),
      ]);

      const summary = await runPayrollDisbursement("r1");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(summary.alreadyDone).toBe(1);
      expect(summary.payoutOk).toBe(0);
    });

    it("retries a line item whose payout previously failed, and post-processes it once the retry succeeds", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ payoutStatus: "failed", postProcessed: false }),
      ]);
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 0 }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "contact_1" }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "fa_1" }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "payout_1", status: "processing" }),
        });

      const summary = await runPayrollDisbursement("r1");

      expect(fetchMock).toHaveBeenCalled();
      expect(summary.payoutOk).toBe(1);
      // Now that the retry succeeded, post-processing must run for it — the
      // in-memory line item fetched at the top of this call is stale
      // ("failed"), so this only passes if the fix tracks this pass's
      // actual outcome rather than trusting that stale snapshot.
      expect(db.payrollLineItem.update).toHaveBeenCalledWith({
        where: { id: "li1" },
        data: { postProcessed: true },
      });
    });

    it("does not post-process a line item whose retried payout fails again", async () => {
      db.payrollLineItem.findMany.mockResolvedValue([
        baseLineItem({ payoutStatus: "failed", postProcessed: false }),
      ]);
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 0 }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "contact_1" }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "fa_1" }) })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: { description: "Still failing" } }),
        });

      await runPayrollDisbursement("r1");

      expect(db.notification.create).not.toHaveBeenCalled();
    });
  });
});
