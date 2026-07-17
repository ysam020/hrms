jest.mock("@hrms/db", () => ({
  getClientForDb: jest.fn(),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { getClientForDb } from "@hrms/db";
import { logger } from "@hrms/logger";
import { auditLogMiddleware } from "../../middleware/auditLog";

function makeReqRes(overrides: Partial<any> = {}) {
  const finishHandlers: Array<() => void> = [];
  const req: any = {
    path: "/api/v1/logout",
    user: { tenantId: "t1", dbName: "tenant_db", userId: "u1" },
    ip: "1.2.3.4",
    socket: { remoteAddress: "9.9.9.9" },
    headers: { "user-agent": "TestAgent/1.0" },
    ...overrides,
  };
  const res: any = {
    statusCode: 200,
    on: jest.fn((event: string, handler: () => void) => {
      if (event === "finish") finishHandlers.push(handler);
    }),
    __fireFinish: () => finishHandlers.forEach((h) => h()),
  };
  return { req, res };
}

describe("auditLogMiddleware", () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate = jest.fn().mockResolvedValue(undefined);
    (getClientForDb as jest.Mock).mockReturnValue({
      auditLog: { create: mockCreate },
    });
  });

  it("calls next() immediately and does not register a finish listener for a non-audited path", () => {
    const { req, res } = makeReqRes({ path: "/api/v1/employee" });
    const next = jest.fn();

    auditLogMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.on).not.toHaveBeenCalled();
  });

  it("calls next() and still registers a finish listener for an audited path", () => {
    const { req, res } = makeReqRes();
    const next = jest.fn();

    auditLogMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.on).toHaveBeenCalledWith("finish", expect.any(Function));
  });

  it("writes an audit log entry with a sanitized 'Logged out' description on success", async () => {
    const { req, res } = makeReqRes({ path: "/api/v1/logout" });
    auditLogMiddleware(req, res, jest.fn());

    res.__fireFinish();
    await new Promise((resolve) => setImmediate(resolve));

    expect(getClientForDb).toHaveBeenCalledWith("tenant_db");
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "t1",
        userId: "u1",
        action: "AUTH",
        entityType: "auth",
        description: "Logged out",
        ipAddress: "1.2.3.4",
        userAgent: "TestAgent/1.0",
      },
    });
  });

  it.each([
    ["/api/v1/disable-webauthn", "Removed a security key"],
    ["/api/v1/webauthn-register", "Registered a security key"],
    ["/api/v1/webauthn-credential-check", "Account security action"],
  ])("sanitizes %s to '%s'", async (path, expectedDescription) => {
    const { req, res } = makeReqRes({ path });
    auditLogMiddleware(req, res, jest.fn());
    res.__fireFinish();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: expectedDescription }),
      }),
    );
  });

  it("appends '(failed)' to the description for a 4xx/5xx response", async () => {
    const { req, res } = makeReqRes({ path: "/api/v1/logout" });
    res.statusCode = 401;
    auditLogMiddleware(req, res, jest.fn());
    res.__fireFinish();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: "Logged out (failed)" }),
      }),
    );
  });

  it("skips writing when there is no resolved tenantId/dbName (pre-login)", async () => {
    const { req, res } = makeReqRes({ user: undefined });
    auditLogMiddleware(req, res, jest.fn());
    res.__fireFinish();
    await new Promise((resolve) => setImmediate(resolve));

    expect(getClientForDb).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("skips writing for a 3xx redirect (not success, not failure)", async () => {
    const { req, res } = makeReqRes();
    res.statusCode = 302;
    auditLogMiddleware(req, res, jest.fn());
    res.__fireFinish();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("falls back to socket.remoteAddress when req.ip is unavailable", async () => {
    const { req, res } = makeReqRes({ ip: undefined });
    auditLogMiddleware(req, res, jest.fn());
    res.__fireFinish();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ipAddress: "9.9.9.9" }),
      }),
    );
  });

  it("logs (but does not throw) when the audit write itself fails", async () => {
    mockCreate.mockRejectedValue(new Error("db down"));
    const { req, res } = makeReqRes();
    auditLogMiddleware(req, res, jest.fn());
    res.__fireFinish();
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith("Failed to write audit log:", {
      err: expect.any(Error),
    });
  });
});
