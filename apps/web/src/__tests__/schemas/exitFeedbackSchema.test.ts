import { exitFeedbackSchema } from "@web/shared/schemas/exitFeedback";

const validFeedback = {
  overall_job_satisfaction: 4,
  quality_of_communication: "Very open and transparent",
  support_from_manager: "Great support and mentoring",
  appreciation_for_work: "Recognized regularly",
  collaboration_within_the_team: "Strong team culture",
  overall_company_culture: "Inclusive and positive",
};

describe("exitFeedbackSchema", () => {
  it("accepts valid exit feedback", () => {
    const result = exitFeedbackSchema.safeParse(validFeedback);
    expect(result.success).toBe(true);
  });

  it("rejects satisfaction below 1", () => {
    const result = exitFeedbackSchema.safeParse({
      ...validFeedback,
      overall_job_satisfaction: 0,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("1 to 5");
  });

  it("rejects satisfaction above 5", () => {
    const result = exitFeedbackSchema.safeParse({
      ...validFeedback,
      overall_job_satisfaction: 6,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("cannot exceed 5");
  });

  it("accepts boundary satisfaction values 1 and 5", () => {
    expect(
      exitFeedbackSchema.safeParse({
        ...validFeedback,
        overall_job_satisfaction: 1,
      }).success,
    ).toBe(true);
    expect(
      exitFeedbackSchema.safeParse({
        ...validFeedback,
        overall_job_satisfaction: 5,
      }).success,
    ).toBe(true);
  });

  it("rejects empty required string fields", () => {
    const result = exitFeedbackSchema.safeParse({
      ...validFeedback,
      quality_of_communication: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional suggestions as null", () => {
    const result = exitFeedbackSchema.safeParse({
      ...validFeedback,
      suggestions: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional suggestions as string", () => {
    const result = exitFeedbackSchema.safeParse({
      ...validFeedback,
      suggestions: "Better work-life balance",
    });
    expect(result.success).toBe(true);
  });

  it("accepts missing suggestions (undefined)", () => {
    const result = exitFeedbackSchema.safeParse(validFeedback);
    expect(result.success).toBe(true);
  });
});
