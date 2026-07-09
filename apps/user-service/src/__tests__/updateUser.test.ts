import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { updateUser } from "../handlers/updateUser";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { update: jest.fn() },
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

const mockUpdate = prisma.user.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockDelete = cacheManager.delete as jest.Mock;

describe("updateUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
  });

  it("updates user with provided fields and returns OK", async () => {
    const updatedUser = {
      id: "user-1",
      email: "john@example.com",
      username: "john",
      role: ["employee"],
      first_name: "Jane",
      last_name: "Doe",
      mobile: "9999999999",
      department: "HR",
      designation: "Manager",
      employeeStatus: "Active",
      employee_photo: "new-photo.jpg",
      createdAt: new Date(),
    };
    mockUpdate.mockResolvedValue(updatedUser);

    const cb = makeCallback();
    await updateUser(
      makeCall({
        userId: "user-1",
        firstName: "Jane",
        lastName: "Doe",
        phone: "9999999999",
        employeePhoto: "new-photo.jpg",
      }),
      cb,
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        first_name: "Jane",
        last_name: "Doe",
        mobile: "9999999999",
        employee_photo: "new-photo.jpg",
      },
      select: expect.objectContaining({ id: true, email: true }),
    });
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_UPDATED,
      status: status.OK,
      data: expect.objectContaining({ id: "user-1" }),
    });
  });

  it("omits falsy fields from update data", async () => {
    const updatedUser = { id: "user-1" };
    mockUpdate.mockResolvedValue(updatedUser);

    // Only firstName provided; lastName/phone/employeePhoto are falsy
    await updateUser(
      makeCall({ userId: "user-1", firstName: "Jane" }),
      makeCallback(),
    );

    const callArgs = mockUpdate.mock.calls[0][0];
    expect(callArgs.data).toEqual({ first_name: "Jane" });
    expect(callArgs.data).not.toHaveProperty("last_name");
    expect(callArgs.data).not.toHaveProperty("mobile");
    expect(callArgs.data).not.toHaveProperty("employee_photo");
  });

  it("sends empty data object when no updatable fields provided", async () => {
    mockUpdate.mockResolvedValue({ id: "user-1" });

    await updateUser(makeCall({ userId: "user-1" }), makeCallback());

    const callArgs = mockUpdate.mock.calls[0][0];
    expect(callArgs.data).toEqual({});
  });

  it("invalidates user and users cache after update", async () => {
    mockUpdate.mockResolvedValue({ id: "user-1" });

    await updateUser(
      makeCall({ userId: "user-1", firstName: "Jane" }),
      makeCallback(),
    );

    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:users:*");
    expect(mockDelete).toHaveBeenCalledWith("t:t1:user:user-1");
  });

  it("returns INTERNAL on database error", async () => {
    mockUpdate.mockRejectedValue(new Error("User not found"));
    const cb = makeCallback();
    await updateUser(makeCall({ userId: "unknown-id" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: {},
    });
  });
});
