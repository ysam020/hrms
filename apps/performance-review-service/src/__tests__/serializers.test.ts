import {
  toPerformanceReviewCycleProto,
  toPerformanceReviewProto,
} from "../handlers/serializers";

describe("toPerformanceReviewCycleProto", () => {
  it("converts dates to ISO strings and fills in defaults for nullish fields", () => {
    const result = toPerformanceReviewCycleProto({
      id: "c1",
      name: "H1 2026",
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-06-30T00:00:00Z"),
      status: "active",
      ratingScale: 5,
      createdBy: "hr1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result).toEqual({
      id: "c1",
      name: "H1 2026",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-06-30T00:00:00.000Z",
      status: "active",
      ratingScale: 5,
      createdBy: "hr1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("defaults missing/null fields to empty string or zero", () => {
    const result = toPerformanceReviewCycleProto({});
    expect(result).toEqual({
      id: "",
      name: "",
      periodStart: "",
      periodEnd: "",
      status: "",
      ratingScale: 0,
      createdBy: "",
      createdAt: "",
    });
  });
});

describe("toPerformanceReviewProto", () => {
  it("converts all date fields to ISO strings when present", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    const result = toPerformanceReviewProto({
      id: "r1",
      cycleId: "c1",
      userId: "u1",
      reviewerId: "mgr1",
      status: "approved",
      selfRating: 4,
      managerRating: 4.5,
      overallRating: 4.2,
      recommendedIncrementPct: 10,
      effectiveFrom: now,
      salaryStructureId: "ss1",
      submittedAt: now,
      finalizedAt: now,
      managerSubmittedAt: now,
      createdAt: now,
    });
    expect(result.effectiveFrom).toBe(now.toISOString());
    expect(result.submittedAt).toBe(now.toISOString());
    expect(result.finalizedAt).toBe(now.toISOString());
    expect(result.managerSubmittedAt).toBe(now.toISOString());
    expect(result.recommendedIncrementPct).toBe(10);
  });

  it("defaults nullish numeric/string/date fields", () => {
    const result = toPerformanceReviewProto({ id: "r1" });
    expect(result).toEqual({
      id: "r1",
      cycleId: "",
      userId: "",
      reviewerId: "",
      status: "",
      selfComments: "",
      selfRating: 0,
      managerComments: "",
      managerRating: 0,
      overallRating: 0,
      recommendedIncrementPct: 0,
      effectiveFrom: "",
      salaryStructureId: "",
      submittedAt: "",
      finalizedAt: "",
      managerSubmittedAt: "",
      createdAt: "",
    });
  });
});
