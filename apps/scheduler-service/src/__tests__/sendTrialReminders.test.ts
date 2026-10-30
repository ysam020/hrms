import { prisma } from "@hrms/db";
import { notify } from "@hrms/notifications";
import { sendTrialReminders } from "../jobs/sendTrialReminders";

jest.mock("@hrms/db", () => ({
  prisma: {
    tenant: { findMany: jest.fn(), updateMany: jest.fn() },
    tenantMembership: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/common", () => ({
  PLATFORM_FROM: '"Praesto" <noreply@praesto.in>',
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const db: any = prisma;
const mockNotify = notify as jest.Mock;
const NOW = new Date("2026-10-30T09:30:00Z");
const HOUR_MS = 60 * 60 * 1000;

const trialTenant = (hoursLeft: number) => ({
  id: "t1",
  name: "Acme <Labs>",
  planTier: "growth",
  billing: "monthly",
  planExpiresAt: new Date(NOW.getTime() + hoursLeft * HOUR_MS),
  paymentMethodSummary: "acme@okhdfc",
});

describe("sendTrialReminders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    db.tenant.updateMany.mockResolvedValue({ count: 1 });
    db.tenantMembership.findFirst.mockResolvedValue({ userId: "u1" });
    db.user.findUnique.mockResolvedValue({
      email: "owner@acme.test",
      username: "owner",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("only looks at trialing tenants ending within 3 days", async () => {
    db.tenant.findMany.mockResolvedValue([]);
    await sendTrialReminders();
    expect(db.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subscriptionStatus: "trialing",
          planExpiresAt: {
            gt: NOW,
            lte: new Date(NOW.getTime() + 72 * HOUR_MS),
          },
        },
      }),
    );
  });

  it("claims and sends the 3-day reminder", async () => {
    db.tenant.findMany.mockResolvedValue([trialTenant(60)]);
    await sendTrialReminders();

    expect(db.tenant.updateMany).toHaveBeenCalledWith({
      where: {
        id: "t1",
        subscriptionStatus: "trialing",
        NOT: { trialRemindersSent: { has: "3d" } },
      },
      data: { trialRemindersSent: { push: ["3d"] } },
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    const { event, email } = mockNotify.mock.calls[0][0];
    expect(event).toBe("trialEndingReminder");
    expect(email.to).toBe("owner@acme.test");
    expect(email.subject).toBe("Your Praesto free trial ends in 3 days");
  });

  it("sends the 1-day reminder and marks the 3-day one done with it", async () => {
    db.tenant.findMany.mockResolvedValue([trialTenant(20)]);
    await sendTrialReminders();

    expect(db.tenant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { trialRemindersSent: { has: "1d" } },
        }),
        data: { trialRemindersSent: { push: ["1d", "3d"] } },
      }),
    );
    expect(mockNotify.mock.calls[0][0].email.subject).toBe(
      "Your Praesto free trial ends tomorrow",
    );
  });

  it("sends nothing when the reminder was already claimed (retry / overlapping run)", async () => {
    db.tenant.findMany.mockResolvedValue([trialTenant(60)]);
    db.tenant.updateMany.mockResolvedValue({ count: 0 });
    await sendTrialReminders();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("escapes tenant-controlled text in the email body", async () => {
    db.tenant.findMany.mockResolvedValue([trialTenant(60)]);
    await sendTrialReminders();
    const html: string = mockNotify.mock.calls[0][0].email.html;
    expect(html).toContain("Acme &lt;Labs&gt;");
    expect(html).not.toContain("<Labs>");
  });

  it("keeps going when one tenant fails", async () => {
    db.tenant.findMany.mockResolvedValue([
      trialTenant(60),
      { ...trialTenant(60), id: "t2" },
    ]);
    db.tenant.updateMany
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValueOnce({ count: 1 });
    await sendTrialReminders();
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0].tenantId).toBe("t2");
  });
});
