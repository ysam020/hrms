jest.mock("@hrms/db", () => ({
  prisma: { tenant: { findUnique: jest.fn() } },
}));

import { prisma } from "@hrms/db";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription";

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
}

describe("requireActiveSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes through immediately when there is no tenantId on the request", async () => {
    const req: any = { user: {} };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("passes through when the tenant cannot be found", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
    const req: any = { user: { tenantId: "t1" } };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("blocks with 402 Payment Required when the subscription has expired", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      subscriptionStatus: "expired",
      planExpiresAt: null,
    });
    const req: any = { user: { tenantId: "t1" } };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Your subscription has expired. Please renew to continue.",
      }),
    );
  });

  it("allows access during the grace period and sets warning headers with the expiry date", async () => {
    const expiresAt = new Date("2026-08-01T00:00:00Z");
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      subscriptionStatus: "grace_period",
      planExpiresAt: expiresAt,
    });
    const req: any = { user: { tenantId: "t1" } };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      "X-Subscription-Grace-Period",
      "true",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "X-Plan-Expires-At",
      expiresAt.toISOString(),
    );
  });

  it("allows access during the grace period without an expiry header when planExpiresAt is null", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      subscriptionStatus: "grace_period",
      planExpiresAt: null,
    });
    const req: any = { user: { tenantId: "t1" } };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "X-Plan-Expires-At",
      expect.anything(),
    );
  });

  it("allows access while cancelling and sets a cancellation-pending header", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      subscriptionStatus: "cancelling",
      planExpiresAt: null,
    });
    const req: any = { user: { tenantId: "t1" } };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      "X-Subscription-Cancelling",
      "true",
    );
  });

  it("blocks with 402 when cancelled and planExpiresAt has passed", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      subscriptionStatus: "cancelled",
      planExpiresAt: new Date("2020-01-01T00:00:00Z"),
    });
    const req: any = { user: { tenantId: "t1" } };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          "Your subscription was cancelled and your access has ended. Please resubscribe to continue.",
      }),
    );
  });

  it("blocks with 402 when cancelled and planExpiresAt is null", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      subscriptionStatus: "cancelled",
      planExpiresAt: null,
    });
    const req: any = { user: { tenantId: "t1" } };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it("allows access and sets cancelled + expiry headers when cancelled but still within the paid period", async () => {
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      subscriptionStatus: "cancelled",
      planExpiresAt: expiresAt,
    });
    const req: any = { user: { tenantId: "t1" } };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      "X-Subscription-Cancelled",
      "true",
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "X-Plan-Expires-At",
      expiresAt.toISOString(),
    );
  });

  it("allows access for an active subscription without setting any warning headers", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      subscriptionStatus: "active",
      planExpiresAt: null,
    });
    const req: any = { user: { tenantId: "t1" } };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("fails open (lets the request through) when the DB lookup throws", async () => {
    (prisma.tenant.findUnique as jest.Mock).mockRejectedValue(
      new Error("db down"),
    );
    const req: any = { user: { tenantId: "t1" } };
    const res = makeRes();
    const next = jest.fn();

    await requireActiveSubscription(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
