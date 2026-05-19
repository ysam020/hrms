import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { createEmployee } from "../handlers/createEmployee";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
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

const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserCreate = prisma.user.create as jest.Mock;

describe("createEmployee", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns INVALID_ARGUMENT when username is missing", async () => {
    const cb = makeCallback();
    await createEmployee(makeCall({ email: "test@example.com" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("returns ALREADY_EXISTS when username is taken", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "existing-id",
      username: "john",
    });
    const cb = makeCallback();
    await createEmployee(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_USERNAME_EXISTS,
      status: status.ALREADY_EXISTS,
    });
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("creates employee and returns OK on happy path", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const newUser = {
      id: "new-id",
      username: "jane",
      email: "jane@example.com",
      first_name: "Jane",
      last_name: "Doe",
      department: "Engineering",
      designation: "Developer",
      joining_date: "2024-01-01",
      mobile: "1234567890",
      role: ["employee"],
      employeeStatus: "Active",
    };
    mockUserCreate.mockResolvedValue(newUser);

    const cb = makeCallback();
    await createEmployee(
      makeCall({
        username: "jane",
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        department: "Engineering",
        designation: "Developer",
        joiningDate: "2024-01-01",
        mobile: "1234567890",
      }),
      cb,
    );

    expect(mockUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: "jane",
        email: "jane@example.com",
        first_name: "Jane",
        last_name: "Doe",
        role: { set: ["employee"] },
        employeeStatus: "Active",
      }),
    });
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_CREATED,
      status: status.OK,
      data: newUser,
    });
  });

  it("sets optional fields to null when not provided", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "id", username: "minimal" });

    const cb = makeCallback();
    await createEmployee(makeCall({ username: "minimal" }), cb);

    expect(mockUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: "minimal",
        email: null,
        first_name: null,
        last_name: null,
      }),
    });
  });

  it("returns INTERNAL on database error", async () => {
    mockUserFindUnique.mockRejectedValue(new Error("DB connection failed"));
    const cb = makeCallback();
    await createEmployee(makeCall({ username: "error-user" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
