import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { updateJobOpening } from "../handlers/updateJobOpening";

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

describe("updateJobOpening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...jobRow, jobTitle: "Senior SWE" });
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await updateJobOpening(makeCall({ jobTitle: "SWE" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when job opening does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await updateJobOpening(makeCall({ id: "j-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns FAILED_PRECONDITION for a deleted job opening (lowercase status)", async () => {
    mockFindUnique.mockResolvedValue({ ...jobRow, status: "deleted" });
    const cb = makeCallback();
    await updateJobOpening(makeCall({ id: "j-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }),
    );
  });

  it("returns FAILED_PRECONDITION for a deleted job opening (real 'Deleted' status)", async () => {
    // deleteJobOpening.ts always writes status: "Deleted" — this guard must
    // catch the real stored value, not just a lowercase variant.
    mockFindUnique.mockResolvedValue({ ...jobRow, status: "Deleted" });
    const cb = makeCallback();
    await updateJobOpening(makeCall({ id: "j-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("persists jobDescription, requiredSkills, and numberOfVacancies", async () => {
    mockFindUnique.mockResolvedValue(jobRow);
    const cb = makeCallback();
    await updateJobOpening(
      makeCall({
        id: "j-1",
        jobDescription: "Build things",
        requiredSkills: "TypeScript, React",
        numberOfVacancies: 3,
      }),
      cb,
    );
    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.jobDescription).toBe("Build things");
    expect(updateData.requiredSkills).toBe("TypeScript, React");
    expect(updateData.numberOfVacancies).toBe(3);
  });

  it("updates job opening and invalidates cache", async () => {
    mockFindUnique.mockResolvedValue(jobRow);
    const cb = makeCallback();
    await updateJobOpening(
      makeCall({ id: "j-1", jobTitle: "Senior SWE", updatedBy: "admin" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "j-1" } }),
    );
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:jobOpenings:*");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("maps jobStatus to status in update data", async () => {
    mockFindUnique.mockResolvedValue(jobRow);
    const cb = makeCallback();
    await updateJobOpening(makeCall({ id: "j-1", jobStatus: "closed" }), cb);
    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.status).toBe("closed");
    expect(updateData.jobStatus).toBeUndefined();
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await updateJobOpening(makeCall({ id: "j-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
