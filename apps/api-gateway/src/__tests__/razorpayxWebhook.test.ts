import { createHmac } from "crypto";
import {
  prismaWithTenant as prisma,
  getClientForDb,
  runWithTenant,
} from "@hrms/db";
import { handleRazorpayXWebhook } from "../handlers/razorpayxWebhook";

jest.mock("@hrms/db", () => {
  const _db: any = {
    payoutTenantIndex: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
    payrollLineItem: { findFirst: jest.fn(), update: jest.fn() },
  };
  return {
    prismaWithTenant: _db,
    getClientForDb: jest.fn().mockReturnValue({ __client: true }),
    runWithTenant: jest.fn((_tid, _client, fn) => fn()),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockIndexFindUnique = (prisma as any).payoutTenantIndex
  .findUnique as jest.Mock;
const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;
const mockLineItemFindFirst = (prisma as any).payrollLineItem
  .findFirst as jest.Mock;
const mockLineItemUpdate = (prisma as any).payrollLineItem.update as jest.Mock;

const SECRET = "test-webhook-secret";

function makeReq(payload: object) {
  const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = createHmac("sha256", SECRET).update(rawBody).digest("hex");
  return {
    headers: { "x-razorpay-signature": signature },
    body: rawBody,
  } as any;
}

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("handleRazorpayXWebhook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_X_WEBHOOK_SECRET = SECRET;
  });

  it("returns 500 when the webhook secret is not configured", async () => {
    delete process.env.RAZORPAY_X_WEBHOOK_SECRET;
    const req = makeReq({ event: "payout.processed", payload: {} });
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("returns 400 when the signature header is missing", async () => {
    const req = makeReq({ event: "payout.processed", payload: {} });
    delete req.headers["x-razorpay-signature"];
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when the signature is invalid", async () => {
    const req = makeReq({ event: "payout.processed", payload: {} });
    req.headers["x-razorpay-signature"] = "deadbeef".repeat(8);
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const rawBody = Buffer.from("not json", "utf8");
    const signature = createHmac("sha256", SECRET)
      .update(rawBody)
      .digest("hex");
    const req = {
      headers: { "x-razorpay-signature": signature },
      body: rawBody,
    } as any;
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("acks 200 and does nothing further when the payload has no payout entity", async () => {
    const req = makeReq({ event: "payout.processed", payload: {} });
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockIndexFindUnique).not.toHaveBeenCalled();
  });

  it("acks 200 and stops when there is no tenant index for the payout", async () => {
    mockIndexFindUnique.mockResolvedValue(null);
    const req = makeReq({
      event: "payout.processed",
      payload: { payout: { entity: { id: "pout_1" } } },
    });
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
  });

  it("stops when the resolved tenant has no dbName", async () => {
    mockIndexFindUnique.mockResolvedValue({ tenantId: "t1" });
    mockTenantFindUnique.mockResolvedValue({ dbName: null });
    const req = makeReq({
      event: "payout.processed",
      payload: { payout: { entity: { id: "pout_1" } } },
    });
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(getClientForDb).not.toHaveBeenCalled();
  });

  it("stops when no PayrollLineItem is found for the payout", async () => {
    mockIndexFindUnique.mockResolvedValue({ tenantId: "t1" });
    mockTenantFindUnique.mockResolvedValue({ dbName: "tenant_t1" });
    mockLineItemFindFirst.mockResolvedValue(null);
    const req = makeReq({
      event: "payout.processed",
      payload: { payout: { entity: { id: "pout_1" } } },
    });
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(mockLineItemUpdate).not.toHaveBeenCalled();
  });

  it("ignores an unmapped event type without updating", async () => {
    mockIndexFindUnique.mockResolvedValue({ tenantId: "t1" });
    mockTenantFindUnique.mockResolvedValue({ dbName: "tenant_t1" });
    mockLineItemFindFirst.mockResolvedValue({
      id: "li1",
      payoutStatus: "pending",
    });
    const req = makeReq({
      event: "payout.unknown_event",
      payload: { payout: { entity: { id: "pout_1" } } },
    });
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(mockLineItemUpdate).not.toHaveBeenCalled();
  });

  it("updates payoutStatus to processed on payout.processed", async () => {
    mockIndexFindUnique.mockResolvedValue({ tenantId: "t1" });
    mockTenantFindUnique.mockResolvedValue({ dbName: "tenant_t1" });
    mockLineItemFindFirst.mockResolvedValue({
      id: "li1",
      payoutStatus: "pending",
    });
    const req = makeReq({
      event: "payout.processed",
      payload: { payout: { entity: { id: "pout_1" } } },
    });
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(runWithTenant).toHaveBeenCalledWith(
      "t1",
      { __client: true },
      expect.any(Function),
    );
    expect(mockLineItemUpdate).toHaveBeenCalledWith({
      where: { id: "li1" },
      data: { payoutStatus: "processed" },
    });
  });

  it("records the failure reason on payout.failed", async () => {
    mockIndexFindUnique.mockResolvedValue({ tenantId: "t1" });
    mockTenantFindUnique.mockResolvedValue({ dbName: "tenant_t1" });
    mockLineItemFindFirst.mockResolvedValue({
      id: "li1",
      payoutStatus: "pending",
    });
    const req = makeReq({
      event: "payout.failed",
      payload: {
        payout: {
          entity: {
            id: "pout_1",
            error: { description: "Insufficient funds" },
          },
        },
      },
    });
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(mockLineItemUpdate).toHaveBeenCalledWith({
      where: { id: "li1" },
      data: {
        payoutStatus: "failed",
        payoutFailureReason: "Insufficient funds",
      },
    });
  });

  it("falls back to 'Unknown' failure reason when Razorpay provides none", async () => {
    mockIndexFindUnique.mockResolvedValue({ tenantId: "t1" });
    mockTenantFindUnique.mockResolvedValue({ dbName: "tenant_t1" });
    mockLineItemFindFirst.mockResolvedValue({
      id: "li1",
      payoutStatus: "pending",
    });
    const req = makeReq({
      event: "payout.failed",
      payload: { payout: { entity: { id: "pout_1" } } },
    });
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(mockLineItemUpdate).toHaveBeenCalledWith({
      where: { id: "li1" },
      data: { payoutStatus: "failed", payoutFailureReason: "Unknown" },
    });
  });

  it("updates payoutStatus to reversed on payout.reversed", async () => {
    mockIndexFindUnique.mockResolvedValue({ tenantId: "t1" });
    mockTenantFindUnique.mockResolvedValue({ dbName: "tenant_t1" });
    mockLineItemFindFirst.mockResolvedValue({
      id: "li1",
      payoutStatus: "pending",
    });
    const req = makeReq({
      event: "payout.reversed",
      payload: { payout: { entity: { id: "pout_1" } } },
    });
    const res = makeRes();

    await handleRazorpayXWebhook(req, res);

    expect(mockLineItemUpdate).toHaveBeenCalledWith({
      where: { id: "li1" },
      data: { payoutStatus: "reversed" },
    });
  });
});
