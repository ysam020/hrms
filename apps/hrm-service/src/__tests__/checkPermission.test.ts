import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { checkPermission } from "../handlers/checkPermission";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = prisma.user.findUnique as jest.Mock;

describe("checkPermission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await checkPermission(makeCall({ resource: "leave", action: "read" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_ID_RESOURCE_ACTION_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when resource is missing", async () => {
    const cb = makeCallback();
    await checkPermission(makeCall({ userId: "user-1", action: "read" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_ID_RESOURCE_ACTION_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when action is missing", async () => {
    const cb = makeCallback();
    await checkPermission(
      makeCall({ userId: "user-1", resource: "leave" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_ID_RESOURCE_ACTION_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await checkPermission(
      makeCall({ userId: "unknown", resource: "leave", action: "read" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_NOT_FOUND,
      status: status.NOT_FOUND,
    });
  });

  it("grants all permissions to super users without checking permissions list", async () => {
    mockFindUnique.mockResolvedValue({
      isSuperUser: true,
      role: [],
      permissions: [],
    });

    const cb = makeCallback();
    await checkPermission(
      makeCall({ userId: "admin", resource: "payroll", action: "delete" }),
      cb,
    );

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.PERMISSION_CHECK_PASSED,
      status: status.OK,
      allowed: true,
      reason: "super_user",
    });
  });

  it("grants permission when exact resource:action key is in user permissions", async () => {
    mockFindUnique.mockResolvedValue({
      isSuperUser: false,
      role: ["employee"],
      permissions: ["leave:read", "leave:apply"],
    });

    const cb = makeCallback();
    await checkPermission(
      makeCall({ userId: "user-1", resource: "leave", action: "read" }),
      cb,
    );

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.PERMISSION_GRANTED,
      status: status.OK,
      allowed: true,
      reason: "direct_permission",
    });
  });

  it("grants permission when wildcard resource:* is in user permissions", async () => {
    mockFindUnique.mockResolvedValue({
      isSuperUser: false,
      role: ["hr"],
      permissions: ["leave:*"],
    });

    const cb = makeCallback();
    await checkPermission(
      makeCall({ userId: "user-1", resource: "leave", action: "approve" }),
      cb,
    );

    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        allowed: true,
        reason: "direct_permission",
      }),
    );
  });

  it("denies permission when no matching permission key exists", async () => {
    mockFindUnique.mockResolvedValue({
      isSuperUser: false,
      role: ["employee"],
      permissions: ["attendance:read"],
    });

    const cb = makeCallback();
    await checkPermission(
      makeCall({ userId: "user-1", resource: "payroll", action: "read" }),
      cb,
    );

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.PERMISSION_DENIED,
      status: status.OK,
      allowed: false,
      reason: "no_permission",
    });
  });

  it("denies permission when permissions array is empty", async () => {
    mockFindUnique.mockResolvedValue({
      isSuperUser: false,
      role: ["employee"],
      permissions: [],
    });

    const cb = makeCallback();
    await checkPermission(
      makeCall({ userId: "user-1", resource: "leave", action: "read" }),
      cb,
    );

    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ allowed: false }),
    );
  });

  it("does not grant leave:read when only leave:write permission exists", async () => {
    mockFindUnique.mockResolvedValue({
      isSuperUser: false,
      role: [],
      permissions: ["leave:write"],
    });

    const cb = makeCallback();
    await checkPermission(
      makeCall({ userId: "user-1", resource: "leave", action: "read" }),
      cb,
    );

    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ allowed: false }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await checkPermission(
      makeCall({ userId: "user-1", resource: "leave", action: "read" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
