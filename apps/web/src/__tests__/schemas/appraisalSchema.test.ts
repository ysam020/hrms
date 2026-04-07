import { appraisalSchema } from "@web/shared/schemas/appraisal";

describe("appraisalSchema", () => {
  it("accepts valid appraisal data", () => {
    const result = appraisalSchema.safeParse({
      score: 4,
      strengths: "Great communicator",
      areasOfImprovement: "Time management skills",
    });
    expect(result.success).toBe(true);
  });

  it("accepts boundary scores 1 and 5", () => {
    expect(
      appraisalSchema.safeParse({
        score: 1,
        strengths: "Meets minimum",
        areasOfImprovement: "Needs improvement here",
      }).success,
    ).toBe(true);
    expect(
      appraisalSchema.safeParse({
        score: 5,
        strengths: "Excellent performer",
        areasOfImprovement: "Keep pushing limits",
      }).success,
    ).toBe(true);
  });

  it("rejects score below 1", () => {
    const result = appraisalSchema.safeParse({
      score: 0,
      strengths: "Good worker",
      areasOfImprovement: "Some improvements",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Minimum score is 1",
    );
  });

  it("rejects score above 5", () => {
    const result = appraisalSchema.safeParse({
      score: 6,
      strengths: "Super performer",
      areasOfImprovement: "None needed",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Maximum score is 5",
    );
  });

  it("rejects strengths shorter than 5 characters", () => {
    const result = appraisalSchema.safeParse({
      score: 3,
      strengths: "Ok",
      areasOfImprovement: "Needs more detail",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "at least 5 characters",
    );
  });

  it("rejects areasOfImprovement shorter than 5 characters", () => {
    const result = appraisalSchema.safeParse({
      score: 3,
      strengths: "Great leader",
      areasOfImprovement: "No",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "at least 5 characters",
    );
  });
});
