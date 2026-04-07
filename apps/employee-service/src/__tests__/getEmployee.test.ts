import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getEmployee } from "../handlers/getEmployee";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

describe("getEmployee", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await getEmployee(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
    expect(mockCacheGet).not.toHaveBeenCalled();
  });

  it("returns cached response when cache hit", async () => {
    const cached = {
      message: MESSAGES.EMPLOYEE_FETCHED,
      status: status.OK,
      data: { id: "emp-1", username: "john" },
    };
    mockCacheGet.mockResolvedValue(cached);

    const cb = makeCallback();
    await getEmployee(makeCall({ id: "emp-1" }), cb);

    expect(cb).toHaveBeenCalledWith(null, cached);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when employee does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getEmployee(makeCall({ id: "missing-id" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_NOT_FOUND,
      status: status.NOT_FOUND,
    });
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it("fetches, caches and returns employee on happy path", async () => {
    const user = { id: "emp-1", username: "jane", email: "jane@example.com" };
    mockFindUnique.mockResolvedValue(user);

    const cb = makeCallback();
    await getEmployee(makeCall({ id: "emp-1" }), cb);

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "emp-1" } });
    expect(mockCacheSet).toHaveBeenCalledWith(
      "employee:emp-1",
      expect.objectContaining({ status: status.OK, data: user }),
      "employee",
    );
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.EMPLOYEE_FETCHED,
      status: status.OK,
      data: user,
    });
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getEmployee(makeCall({ id: "emp-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
