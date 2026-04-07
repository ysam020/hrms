import { jobOpeningSchema } from "@web/shared/schemas/jobOpening";

const today = new Date();
const todayStr = today.toISOString().split("T")[0];

const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split("T")[0];

const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);
const yesterdayStr = yesterday.toISOString().split("T")[0];

const validJob = {
  jobTitle: "Software Engineer",
  numberOfVacancies: 2,
  jobPostingDate: todayStr,
  applicationDeadline: tomorrowStr,
  jobDescription: "Build and maintain software systems",
  requiredSkills: "TypeScript, Node.js",
  experience: "2+ years",
  budget: [50000, 100000] as [number, number],
  hiringManager: "Alice",
};

describe("jobOpeningSchema", () => {
  it("accepts a fully valid job opening", () => {
    const result = jobOpeningSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it("rejects jobTitle shorter than 2 characters", () => {
    const result = jobOpeningSchema.safeParse({ ...validJob, jobTitle: "A" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("at least 2");
  });

  it("rejects non-positive numberOfVacancies", () => {
    const result = jobOpeningSchema.safeParse({
      ...validJob,
      numberOfVacancies: 0,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("greater than 0");
  });

  it("rejects future jobPostingDate", () => {
    const result = jobOpeningSchema.safeParse({
      ...validJob,
      jobPostingDate: tomorrowStr,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "can't be in the future",
    );
  });

  it("rejects applicationDeadline before jobPostingDate", () => {
    const result = jobOpeningSchema.safeParse({
      ...validJob,
      jobPostingDate: todayStr,
      applicationDeadline: yesterdayStr,
    });
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(issues.some((i) => i.path.includes("applicationDeadline"))).toBe(
      true,
    );
  });

  it("rejects invalid budget range (min >= max)", () => {
    const result = jobOpeningSchema.safeParse({
      ...validJob,
      budget: [100000, 50000] as [number, number],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Invalid budget range",
    );
  });

  it("rejects equal budget values", () => {
    const result = jobOpeningSchema.safeParse({
      ...validJob,
      budget: [50000, 50000] as [number, number],
    });
    expect(result.success).toBe(false);
  });

  it("rejects jobDescription shorter than 10 characters", () => {
    const result = jobOpeningSchema.safeParse({
      ...validJob,
      jobDescription: "Short",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "at least 10 characters",
    );
  });

  it("rejects empty hiringManager", () => {
    const result = jobOpeningSchema.safeParse({
      ...validJob,
      hiringManager: "",
    });
    expect(result.success).toBe(false);
  });
});
