import { prisma } from "@hrms/db";
import { getLeaveById } from "../handlers/getLeaveById";

jest.mock("@hrms/db", () => {
  const _db = {
    leaveApplication: { findUnique: jest.fn() },
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

const mockFindUnique = (prisma as any).leaveApplication.findUnique as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("getLeaveById", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await getLeaveById(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when leave does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getLeaveById(makeCall({ id: "leave-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns leave application on success", async () => {
    const leave = { id: "leave-1", username: "john", status: "Pending" };
    mockFindUnique.mockResolvedValue(leave);
    const cb = makeCallback();
    await getLeaveById(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, data: leave }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getLeaveById(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
