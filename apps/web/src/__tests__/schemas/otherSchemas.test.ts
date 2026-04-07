import { feedbackSchema } from "@web/shared/schemas/feedback";
import { rejectApplicationSchema } from "@web/shared/schemas/rejectApplication";
import { attendanceCorrectionSchema } from "@web/shared/schemas/attendanceCorrection";
import { hiringSchema } from "@web/shared/schemas/hiring";

describe("feedbackSchema", () => {
  it("accepts valid feedback", () => {
    const result = feedbackSchema.safeParse({
      manager_strengths: "Great leadership",
      manager_AreasOfImprovement: "Communication could improve",
      feedback: "Overall a positive experience",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty manager_strengths", () => {
    const result = feedbackSchema.safeParse({
      manager_strengths: "",
      manager_AreasOfImprovement: "Some areas",
      feedback: "Good",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Strengths is required",
    );
  });

  it("rejects empty manager_AreasOfImprovement", () => {
    const result = feedbackSchema.safeParse({
      manager_strengths: "Strong",
      manager_AreasOfImprovement: "",
      feedback: "Good",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Areas of improvement is required",
    );
  });

  it("rejects empty feedback", () => {
    const result = feedbackSchema.safeParse({
      manager_strengths: "Strong",
      manager_AreasOfImprovement: "Some areas",
      feedback: "",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Feedback is required",
    );
  });
});

describe("rejectApplicationSchema", () => {
  it("accepts valid reason", () => {
    const result = rejectApplicationSchema.safeParse({
      reason: "Not a good fit",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty reason", () => {
    const result = rejectApplicationSchema.safeParse({ reason: "" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Reason is required",
    );
  });

  it("rejects missing reason field", () => {
    const result = rejectApplicationSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("attendanceCorrectionSchema", () => {
  it("accepts valid username", () => {
    const result = attendanceCorrectionSchema.safeParse({ username: "john" });
    expect(result.success).toBe(true);
  });

  it("rejects empty username", () => {
    const result = attendanceCorrectionSchema.safeParse({ username: "" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Username is required",
    );
  });
});

describe("hiringSchema", () => {
  it("accepts valid hiring data", () => {
    const result = hiringSchema.safeParse({
      salary: 60000,
      joining_date: "2024-06-01",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional reference_by", () => {
    const result = hiringSchema.safeParse({
      salary: 60000,
      joining_date: "2024-06-01",
      reference_by: "Jane Doe",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-integer salary", () => {
    const result = hiringSchema.safeParse({
      salary: 60000.5,
      joining_date: "2024-06-01",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "must be an integer",
    );
  });

  it("rejects missing joining_date", () => {
    const result = hiringSchema.safeParse({ salary: 50000 });
    expect(result.success).toBe(false);
  });

  it("accepts negative salary (schema allows it — only integer is enforced)", () => {
    // hiringSchema uses z.number().int() without .min(), so negatives are valid
    const result = hiringSchema.safeParse({
      salary: -1000,
      joining_date: "2024-06-01",
    });
    expect(result.success).toBe(true);
  });
});
