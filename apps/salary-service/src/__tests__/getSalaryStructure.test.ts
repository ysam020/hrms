import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { getSalaryStructure } from "../handlers/getSalaryStructure";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    salaryStructure: { findFirst: jest.fn() },
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

const mockFindFirst = (prisma as any).salaryStructure.findFirst as jest.Mock;

describe("getSalaryStructure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await getSalaryStructure(makeCall({ month: 3, year: 2024 }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND when no salary structure exists", async () => {
    mockFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await getSalaryStructure(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.NO_SALARY_STRUCTURE_FOUND,
      status: status.NOT_FOUND,
    });
  });

  it("applies month and year filters when provided", async () => {
    mockFindFirst.mockResolvedValue({ id: "sal-1" });

    await getSalaryStructure(
      makeCall({ userId: "john", month: "3", year: "2024" }),
      makeCallback(),
    );

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "john",
          month: 3,
          year: 2024,
        }),
      }),
    );
  });

  it("queries without month/year filters when they are not provided", async () => {
    mockFindFirst.mockResolvedValue({ id: "sal-1" });

    await getSalaryStructure(makeCall({ userId: "john" }), makeCallback());

    const callArgs = mockFindFirst.mock.calls[0][0];
    expect(callArgs.where).toEqual({ userId: "john" });
  });

  it("orders by createdAt descending to get latest record", async () => {
    mockFindFirst.mockResolvedValue({ id: "sal-1" });

    await getSalaryStructure(makeCall({ userId: "john" }), makeCallback());

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("returns salary structure data on happy path", async () => {
    const structure = {
      id: "sal-1",
      userId: "john",
      basicPay: 50000,
      month: 3,
      year: 2024,
    };
    mockFindFirst.mockResolvedValue(structure);

    const cb = makeCallback();
    await getSalaryStructure(
      makeCall({ userId: "john", month: "3", year: "2024" }),
      cb,
    );

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.SALARY_STRUCTURE_FETCHED,
      status: status.OK,
      data: structure,
    });
  });

  it("returns INTERNAL on database error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getSalaryStructure(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
