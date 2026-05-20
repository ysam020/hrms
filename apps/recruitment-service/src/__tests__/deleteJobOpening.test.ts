import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { deleteJobOpening } from "../handlers/deleteJobOpening";

jest.mock("@hrms/db", () => {
  const _db = {
    jobOpening: { findUnique: jest.fn(), update: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).jobOpening.findUnique as jest.Mock;
const mockUpdate = (prisma as any).jobOpening.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const jobRow = { id: "j-1", jobTitle: "SWE", status: "open" };

describe("deleteJobOpening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...jobRow, status: "Deleted" });
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await deleteJobOpening(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when job opening does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await deleteJobOpening(makeCall({ id: "j-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns ALREADY_EXISTS when job opening already deleted", async () => {
    mockFindUnique.mockResolvedValue({ ...jobRow, status: "Deleted" });
    const cb = makeCallback();
    await deleteJobOpening(makeCall({ id: "j-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 6 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("soft-deletes job opening and invalidates cache", async () => {
    mockFindUnique.mockResolvedValue(jobRow);
    const cb = makeCallback();
    await deleteJobOpening(makeCall({ id: "j-1", deletedBy: "admin" }), cb);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "j-1" },
      data: expect.objectContaining({ status: "Deleted", deletedBy: "admin" }),
    });
    expect(mockInvalidate).toHaveBeenCalledWith("jobOpenings:*");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await deleteJobOpening(makeCall({ id: "j-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
