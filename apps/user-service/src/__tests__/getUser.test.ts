import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getUser } from "../handlers/getUser";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findFirst: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("@hrms/crypto", () => ({
  safeDecrypt: jest.fn((v: string | null | undefined) => v ?? ""),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindFirst = prisma.user.findFirst as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const dbUser = {
  id: "user-1",
  email: "john@example.com",
  username: "john",
  role: ["employee"],
  first_name: "John",
  last_name: "Doe",
  middle_name: null,
  mobile: "encrypted-mobile",
  department: "Engineering",
  designation: "Developer",
  employeeStatus: "Active",
  employee_photo: "photo.jpg",
  dob: "1990-01-01",
  blood_group: "O+",
  official_email: "john.official@company.com",
  joining_date: "2022-01-01",
  communication_address_line_1: null,
  communication_address_line_2: null,
  communication_address_city: null,
  communication_address_state: null,
  communication_address_pincode: null,
  permanent_address_line_1: null,
  permanent_address_line_2: null,
  permanent_address_city: null,
  permanent_address_state: null,
  permanent_address_pincode: null,
  bank_account_no: null,
  bank_name: null,
  ifsc_code: null,
  aadhar_no: null,
  aadhar_photo_front: null,
  pan_no: null,
  pan_photo: null,
  pf_no: null,
  uan_no: null,
  esic_no: null,
  isSuperUser: false,
  dateOfTermination: null,
  reasonForTermination: null,
  dateOfAbscond: null,
};

describe("getUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns cached response on cache hit", async () => {
    const cached = {
      message: MESSAGES.USER_FETCHED,
      status: status.OK,
      data: { id: "user-1" },
    };
    mockCacheGet.mockResolvedValue(cached);

    const cb = makeCallback();
    await getUser(makeCall({ userId: "user-1" }), cb);

    expect(cb).toHaveBeenCalledWith(null, cached);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await getUser(makeCall({ userId: "unknown" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: MESSAGES.USER_NOT_FOUND,
        status: status.NOT_FOUND,
      }),
    );
  });

  it("queries by both username and id when userId is a valid ObjectId", async () => {
    mockFindFirst.mockResolvedValue(dbUser);
    const objectId = "507f1f77bcf86cd799439011";

    await getUser(makeCall({ userId: objectId }), makeCallback());

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ username: objectId }, { id: objectId }],
      },
    });
  });

  it("queries by username only when userId is not an ObjectId", async () => {
    mockFindFirst.mockResolvedValue(dbUser);

    await getUser(makeCall({ userId: "john" }), makeCallback());

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { OR: [{ username: "john" }] },
    });
  });

  it("maps all user fields correctly in response", async () => {
    mockFindFirst.mockResolvedValue(dbUser);

    const cb = makeCallback();
    await getUser(makeCall({ userId: "john" }), cb);

    const data = cb.mock.calls[0][1].data;
    expect(data.id).toBe("user-1");
    expect(data.email).toBe("john@example.com");
    expect(data.username).toBe("john");
    expect(data.role).toBe("employee");
    expect(data.firstName).toBe("John");
    expect(data.lastName).toBe("Doe");
    expect(data.department).toBe("Engineering");
    expect(data.isSuperUser).toBe(false);
  });

  it("joins multiple roles with comma", async () => {
    mockFindFirst.mockResolvedValue({ ...dbUser, role: ["admin", "hr"] });

    const cb = makeCallback();
    await getUser(makeCall({ userId: "john" }), cb);

    expect(cb.mock.calls[0][1].data.role).toBe("admin,hr");
  });

  it("defaults null fields to empty strings", async () => {
    mockFindFirst.mockResolvedValue({
      ...dbUser,
      first_name: null,
      middle_name: null,
      department: null,
      dob: null,
    });

    const cb = makeCallback();
    await getUser(makeCall({ userId: "john" }), cb);

    const data = cb.mock.calls[0][1].data;
    expect(data.firstName).toBe("");
    expect(data.middleName).toBe("");
    expect(data.department).toBe("");
    expect(data.dob).toBe("");
  });

  it("caches the response with user key", async () => {
    mockFindFirst.mockResolvedValue(dbUser);

    await getUser(makeCall({ userId: "john" }), makeCallback());

    expect(mockCacheSet).toHaveBeenCalledWith(
      "t:t1:user:john",
      expect.objectContaining({ status: status.OK }),
      "user",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getUser(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: MESSAGES.INTERNAL_SERVER_ERROR,
        status: status.INTERNAL,
      }),
    );
  });
});
