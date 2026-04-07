import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { getProfile } from "../handlers/getProfile";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = prisma.user.findUnique as jest.Mock;

const dbUser = {
  id: "user-1",
  email: "john@example.com",
  username: "john",
  role: ["employee"],
  first_name: "John",
  last_name: "Doe",
  mobile: "1234567890",
  department: "Engineering",
  designation: "Developer",
  employee_photo: "photo.jpg",
};

describe("getProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getProfile(makeCall({ userId: "unknown-id" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_NOT_FOUND,
      status: status.NOT_FOUND,
      data: null,
    });
  });

  it("returns mapped profile data on happy path", async () => {
    mockFindUnique.mockResolvedValue(dbUser);

    const cb = makeCallback();
    await getProfile(makeCall({ userId: "user-1" }), cb);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: expect.objectContaining({
        id: true,
        email: true,
        username: true,
        role: true,
      }),
    });
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.PROFILE_FETCHED,
      status: status.OK,
      data: {
        id: "user-1",
        email: "john@example.com",
        username: "john",
        role: ["employee"],
        firstName: "John",
        lastName: "Doe",
        mobile: "1234567890",
        department: "Engineering",
        designation: "Developer",
        employeePhoto: "photo.jpg",
      },
    });
  });

  it("defaults null fields to empty strings in response", async () => {
    mockFindUnique.mockResolvedValue({
      ...dbUser,
      first_name: null,
      last_name: null,
      mobile: null,
      department: null,
      designation: null,
      employee_photo: null,
    });

    const cb = makeCallback();
    await getProfile(makeCall({ userId: "user-1" }), cb);

    const data = cb.mock.calls[0][1].data;
    expect(data.firstName).toBe("");
    expect(data.lastName).toBe("");
    expect(data.mobile).toBe("");
    expect(data.department).toBe("");
    expect(data.designation).toBe("");
    expect(data.employeePhoto).toBe("");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getProfile(makeCall({ userId: "user-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: null,
    });
  });
});
