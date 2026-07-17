import { prismaWithTenant as prisma } from "@hrms/db";
import { resolveReviewerId } from "../handlers/resolveReviewer";

jest.mock("@hrms/db", () => ({
  prismaWithTenant: { team: { findFirst: jest.fn() } },
}));

const mockFindFirst = (prisma as any).team.findFirst as jest.Mock;

describe("resolveReviewerId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the team leader when the employee is on a team", async () => {
    mockFindFirst.mockResolvedValue({ teamLeaderId: "leader-1" });
    const result = await resolveReviewerId("t1", "u1", "fallback-1");
    expect(result).toBe("leader-1");
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { tenantId: "t1", members: { has: "u1" } },
    });
  });

  it("falls back to the provided fallback user when no team is found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await resolveReviewerId("t1", "u1", "fallback-1");
    expect(result).toBe("fallback-1");
  });

  it("falls back when the team exists but has no teamLeaderId set", async () => {
    mockFindFirst.mockResolvedValue({ teamLeaderId: null });
    const result = await resolveReviewerId("t1", "u1", "fallback-1");
    expect(result).toBe("fallback-1");
  });

  it("returns null when there is no team and no fallback", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await resolveReviewerId("t1", "u1");
    expect(result).toBeNull();
  });
});
