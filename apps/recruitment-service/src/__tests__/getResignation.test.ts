import { prisma } from "@hrms/db";
import { getResignation } from "../handlers/getResignation";

jest.mock("@hrms/db", () => {
  const _db = {
    resignation: { findFirst: jest.fn() },
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

const mockFindFirst = (prisma as any).resignation.findFirst as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const resignation = { id: "res-1", userId: "john", status: "Submitted" };

describe("getResignation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await getResignation(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the current tenant", async () => {
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await getResignation(makeCall({ id: "res-1" }), cb);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "res-1", tenantId: "t1" },
    });
  });

  it("returns NOT_FOUND when resignation does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await getResignation(makeCall({ id: "res-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns resignation data on success", async () => {
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await getResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        status: 0,
        data: expect.objectContaining({
          id: "res-1",
          userId: "john",
          status: "Submitted",
        }),
      }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
