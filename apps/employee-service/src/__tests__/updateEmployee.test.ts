import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { updateEmployee } from "../handlers/updateEmployee";
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

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    invalidatePattern: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockDelete = cacheManager.delete as jest.Mock;

describe("updateEmployee", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await updateEmployee(makeCall({ firstName: "Jane" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND when employee does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await updateEmployee(makeCall({ id: "emp-1", firstName: "Jane" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_NOT_FOUND,
      status: status.NOT_FOUND,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("maps proto field names to db field names and updates employee", async () => {
    const existingUser = { id: "emp-1", username: "john" };
    const updatedUser = {
      id: "emp-1",
      first_name: "Jane",
      last_name: "Smith",
      department: "HR",
    };
    mockFindUnique.mockResolvedValue(existingUser);
    mockUpdate.mockResolvedValue(updatedUser);

    const cb = makeCallback();
    await updateEmployee(
      makeCall({
        id: "emp-1",
        firstName: "Jane",
        lastName: "Smith",
        department: "HR",
      }),
      cb,
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "emp-1" },
      data: { first_name: "Jane", last_name: "Smith", department: "HR" },
    });
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_UPDATED,
      status: status.OK,
      data: updatedUser,
    });
  });

  it("invalidates cache after update", async () => {
    mockFindUnique.mockResolvedValue({ id: "emp-1" });
    mockUpdate.mockResolvedValue({ id: "emp-1" });

    await updateEmployee(
      makeCall({ id: "emp-1", designation: "Manager" }),
      makeCallback(),
    );

    expect(mockInvalidate).toHaveBeenCalledWith("employees:*");
    expect(mockDelete).toHaveBeenCalledWith("employee:emp-1");
  });

  it("skips undefined/null fields when building update data", async () => {
    mockFindUnique.mockResolvedValue({ id: "emp-1" });
    mockUpdate.mockResolvedValue({ id: "emp-1" });

    const cb = makeCallback();
    await updateEmployee(
      makeCall({ id: "emp-1", firstName: "Jane", lastName: undefined }),
      cb,
    );

    const callArgs = mockUpdate.mock.calls[0][0];
    expect(callArgs.data).toHaveProperty("first_name", "Jane");
    expect(callArgs.data).not.toHaveProperty("last_name");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await updateEmployee(makeCall({ id: "emp-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
