import { prisma } from "@hrms/db";
import { getJobOpening } from "../handlers/getJobOpening";

jest.mock("@hrms/db", () => {
  const _db = {
    jobOpening: { findUnique: jest.fn() },
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

const mockFindUnique = (prisma as any).jobOpening.findUnique as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const jobRow = {
  id: "j-1",
  jobTitle: "SWE",
  numberOfVacancies: 2,
  jobPostingDate: new Date("2024-01-01"),
  applicationDeadline: new Date("2024-03-01"),
  jobDescription: "Role desc",
  requiredSkills: "TS",
  experience: 3,
  budget: [80000, 120000],
  department: "Engineering",
  hiringManager: "Alice",
  candidatesHired: 0,
  status: "open",
  createdBy: "admin",
  createdOn: new Date("2024-01-01"),
};

describe("getJobOpening", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await getJobOpening(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when job opening does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getJobOpening(makeCall({ id: "j-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns NOT_FOUND for deleted job opening", async () => {
    mockFindUnique.mockResolvedValue({ ...jobRow, status: "deleted" });
    const cb = makeCallback();
    await getJobOpening(makeCall({ id: "j-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns job opening data on success", async () => {
    mockFindUnique.mockResolvedValue(jobRow);
    const cb = makeCallback();
    await getJobOpening(makeCall({ id: "j-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        status: 0,
        data: expect.objectContaining({ id: "j-1", jobTitle: "SWE" }),
      }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getJobOpening(makeCall({ id: "j-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
