import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { assignRole } from "../handlers/assignRole";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
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
const mockUpdate = prisma.user.update as jest.Mock;

describe("assignRole", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await assignRole(makeCall({ role: ["admin"] }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_ID_ROLE_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when role is missing", async () => {
    const cb = makeCallback();
    await assignRole(makeCall({ userId: "user-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_ID_ROLE_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await assignRole(makeCall({ userId: "user-1", role: ["admin"] }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_NOT_FOUND,
      status: status.NOT_FOUND,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("assigns role and returns updated user data on happy path", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      email: "john@example.com",
      role: ["employee"],
    });
    const updatedUser = {
      id: "user-1",
      email: "john@example.com",
      role: ["admin"],
    };
    mockUpdate.mockResolvedValue(updatedUser);

    const cb = makeCallback();
    await assignRole(
      makeCall({ userId: "user-1", role: ["admin"], assignedBy: "superadmin" }),
      cb,
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { role: ["admin"] },
    });
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.ROLE_ASSIGNED,
      status: status.OK,
      data: {
        id: "user-1",
        email: "john@example.com",
        role: ["admin"],
      },
    });
  });

  it("works without assignedBy (system-initiated role assignment)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      email: "john@example.com",
      role: [],
    });
    mockUpdate.mockResolvedValue({
      id: "user-1",
      email: "john@example.com",
      role: ["hr"],
    });

    const cb = makeCallback();
    await assignRole(makeCall({ userId: "user-1", role: ["hr"] }), cb);

    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.OK }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await assignRole(makeCall({ userId: "user-1", role: ["admin"] }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
