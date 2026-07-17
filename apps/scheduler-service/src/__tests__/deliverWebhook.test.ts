import { createHmac } from "crypto";
import { prisma } from "@hrms/db";
import { isSafeUrl, isSafeHostname } from "@hrms/common";
import { deliverWebhook } from "../jobs/deliverWebhook";

jest.mock("@hrms/db", () => ({
  prisma: {
    webhookDelivery: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/common", () => ({
  isSafeUrl: jest.fn(),
  isSafeHostname: jest.fn(),
}));

jest.mock("@hrms/crypto", () => ({
  aesDecrypt: jest.fn((s: string) => `decrypted:${s}`),
}));

const mockFindUnique = (prisma as any).webhookDelivery.findUnique as jest.Mock;
const mockUpdate = (prisma as any).webhookDelivery.update as jest.Mock;
const mockIsSafeUrl = isSafeUrl as jest.Mock;
const mockIsSafeHostname = isSafeHostname as jest.Mock;

const baseDelivery = {
  id: "delivery-1",
  attempts: 0,
  eventType: "leave.approved",
  payload: { foo: "bar" },
  endpoint: {
    url: "https://example.com/hook",
    secret: "enc-secret",
    isActive: true,
  },
};

describe("deliverWebhook", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // deliverWebhook.ts only clears its 15s abort timer on the success path,
    // not in the catch block — fake timers keep that leftover timer from
    // holding the test process open for the real 15s on failure-path tests.
    jest.useFakeTimers();
    mockIsSafeUrl.mockReturnValue(true);
    mockIsSafeHostname.mockResolvedValue(true);
    mockUpdate.mockResolvedValue({});
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing when the delivery record is not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    await deliverWebhook({ deliveryId: "missing" });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the delivery failed without sending when the endpoint is inactive", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseDelivery,
      endpoint: { ...baseDelivery.endpoint, isActive: false },
    });

    await deliverWebhook({ deliveryId: "delivery-1" });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: { status: "failed", error: "Endpoint deactivated" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the delivery failed and skips sending when SSRF re-validation fails (isSafeUrl false)", async () => {
    mockFindUnique.mockResolvedValue(baseDelivery);
    mockIsSafeUrl.mockReturnValue(false);

    await deliverWebhook({ deliveryId: "delivery-1" });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: { status: "failed", error: "URL failed SSRF re-validation" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the delivery failed and skips sending when DNS re-resolution fails (isSafeHostname false)", async () => {
    mockFindUnique.mockResolvedValue(baseDelivery);
    mockIsSafeHostname.mockResolvedValue(false);

    await deliverWebhook({ deliveryId: "delivery-1" });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: { status: "failed", error: "URL failed SSRF re-validation" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the delivery failed when secret decryption throws", async () => {
    mockFindUnique.mockResolvedValue(baseDelivery);
    const { aesDecrypt } = require("@hrms/crypto");
    (aesDecrypt as jest.Mock).mockImplementationOnce(() => {
      throw new Error("bad ciphertext");
    });

    await deliverWebhook({ deliveryId: "delivery-1" });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: { status: "failed", error: "Secret decryption failed" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs the payload with HMAC-SHA256 of the decrypted secret and sends it as a header", async () => {
    mockFindUnique.mockResolvedValue(baseDelivery);
    fetchMock.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("ok"),
    });

    await deliverWebhook({ deliveryId: "delivery-1" });

    const expectedSig = createHmac("sha256", "decrypted:enc-secret")
      .update(JSON.stringify(baseDelivery.payload))
      .digest("hex");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: expect.objectContaining({
          "X-HRMS-Signature-256": `sha256=${expectedSig}`,
          "X-HRMS-Event": "leave.approved",
          "X-HRMS-Delivery": "delivery-1",
        }),
        body: JSON.stringify(baseDelivery.payload),
      }),
    );
  });

  it("records success and does not throw on a 2xx response", async () => {
    mockFindUnique.mockResolvedValue(baseDelivery);
    fetchMock.mockResolvedValue({
      status: 204,
      text: () => Promise.resolve(""),
    });

    await expect(
      deliverWebhook({ deliveryId: "delivery-1" }),
    ).resolves.toBeUndefined();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: expect.objectContaining({
        status: "success",
        httpStatus: 204,
        attempts: 1,
        deliveredAt: expect.any(Date),
        error: null,
        nextRetryAt: null,
      }),
    });
  });

  it("records failure and re-throws on a non-2xx response, for BullMQ to retry", async () => {
    mockFindUnique.mockResolvedValue(baseDelivery);
    fetchMock.mockResolvedValue({
      status: 500,
      text: () => Promise.resolve("server error"),
    });

    await expect(deliverWebhook({ deliveryId: "delivery-1" })).rejects.toThrow(
      "HTTP 500",
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: expect.objectContaining({
        status: "failed",
        httpStatus: 500,
        error: "HTTP 500",
      }),
    });
  });

  it("records a network-error failure and re-throws when fetch rejects", async () => {
    mockFindUnique.mockResolvedValue(baseDelivery);
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(deliverWebhook({ deliveryId: "delivery-1" })).rejects.toThrow(
      "ECONNREFUSED",
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: expect.objectContaining({
        status: "failed",
        httpStatus: null,
        error: "ECONNREFUSED",
      }),
    });
  });

  it("maps an AbortError to a timeout message and re-throws", async () => {
    mockFindUnique.mockResolvedValue(baseDelivery);
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    fetchMock.mockRejectedValue(abortErr);

    await expect(deliverWebhook({ deliveryId: "delivery-1" })).rejects.toThrow(
      "Timeout after 15000ms",
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: expect.objectContaining({
        status: "failed",
        error: "Timeout after 15000ms",
      }),
    });
  });

  it("increments attempts from the delivery's prior attempt count", async () => {
    mockFindUnique.mockResolvedValue({ ...baseDelivery, attempts: 2 });
    fetchMock.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(""),
    });

    await deliverWebhook({ deliveryId: "delivery-1" });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: 3 }),
      }),
    );
  });
});
