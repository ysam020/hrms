import { prismaWithTenant as prisma } from "@hrms/db";
import { getWorkingDays, isHoliday, eachDate } from "../utils/workingDays";

jest.mock("@hrms/db", () => ({
  prismaWithTenant: { holiday: { findFirst: jest.fn() } },
}));

const mockFindFirst = (prisma as any).holiday.findFirst as jest.Mock;

describe("getWorkingDays", () => {
  it("defaults to Mon-Fri when no settings exist", () => {
    expect(getWorkingDays(null)).toEqual([1, 2, 3, 4, 5]);
  });

  it("defaults to Mon-Fri when workWeekPattern is absent", () => {
    expect(getWorkingDays({})).toEqual([1, 2, 3, 4, 5]);
  });

  it("uses the tenant's configured working days", () => {
    expect(
      getWorkingDays({ workWeekPattern: { workingDays: [0, 1, 2, 3, 4] } }),
    ).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("isHoliday", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns false when there is no holiday record for the month", () => {
    mockFindFirst.mockResolvedValue(null);
    return expect(isHoliday(new Date("2024-06-15T00:00:00Z"))).resolves.toBe(
      false,
    );
  });

  it("returns false when the date isn't in the month's holiday list", async () => {
    mockFindFirst.mockResolvedValue({
      holidays: [{ date: "2024-06-01", name: "New Year-ish" }],
    });
    await expect(isHoliday(new Date("2024-06-15T00:00:00Z"))).resolves.toBe(
      false,
    );
  });

  it("returns true when the date matches a holiday entry", async () => {
    mockFindFirst.mockResolvedValue({
      holidays: [{ date: "2024-06-15", name: "Some Holiday" }],
    });
    await expect(isHoliday(new Date("2024-06-15T00:00:00Z"))).resolves.toBe(
      true,
    );
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { year: 2024, month: 6 },
    });
  });

  it("treats a non-array holidays field as no holidays", async () => {
    mockFindFirst.mockResolvedValue({ holidays: null });
    await expect(isHoliday(new Date("2024-06-15T00:00:00Z"))).resolves.toBe(
      false,
    );
  });
});

describe("eachDate", () => {
  it("returns a single date when start equals end", () => {
    const d = new Date("2024-06-15T00:00:00Z");
    expect(eachDate(d, d)).toEqual([d]);
  });

  it("returns every UTC date inclusive of start and end", () => {
    const start = new Date("2024-06-28T00:00:00Z");
    const end = new Date("2024-07-01T00:00:00Z");
    const result = eachDate(start, end);
    expect(result.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2024-06-28",
      "2024-06-29",
      "2024-06-30",
      "2024-07-01",
    ]);
  });

  it("returns an empty array when start is after end", () => {
    const start = new Date("2024-06-15T00:00:00Z");
    const end = new Date("2024-06-10T00:00:00Z");
    expect(eachDate(start, end)).toEqual([]);
  });
});
