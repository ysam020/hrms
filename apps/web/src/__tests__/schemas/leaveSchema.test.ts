import { leaveSchema } from "@web/shared/schemas/leave";

// Format date as local YYYY-MM-DD (not UTC ISO) to avoid timezone failures
const toDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const today = new Date();
today.setHours(12, 0, 0, 0);

const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);

const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

describe("leaveSchema", () => {
  it("accepts valid leave with from today and to tomorrow", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(today),
      to: toDateStr(tomorrow),
      reason: "Personal work",
    });
    expect(result.success).toBe(true);
  });

  it("accepts from and to on the same day", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(today),
      to: toDateStr(today),
      reason: "Short leave",
    });
    expect(result.success).toBe(true);
  });

  it("rejects from date in the past", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(yesterday),
      to: toDateStr(today),
      reason: "Late application",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "From date cannot be in the past",
    );
  });

  it("rejects to date before from date", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(tomorrow),
      to: toDateStr(today),
      reason: "Invalid range",
    });
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(issues.some((i) => i.path.includes("to"))).toBe(true);
    expect(issues.some((i) => i.message.includes("same or later"))).toBe(true);
  });

  it("rejects empty reason", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(today),
      to: toDateStr(tomorrow),
      reason: "",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Reason is required",
    );
  });

  it("accepts optional sick_leave boolean", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(today),
      to: toDateStr(tomorrow),
      reason: "Sick",
      sick_leave: true,
    });
    expect(result.success).toBe(true);
  });

  it("defaults unit to full_day when omitted", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(today),
      to: toDateStr(tomorrow),
      reason: "Personal work",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.unit).toBe("full_day");
  });

  it("rejects half_day without a session", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(today),
      to: toDateStr(today),
      reason: "Doctor visit",
      unit: "half_day",
    });
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(issues.some((i) => i.path.includes("session"))).toBe(true);
  });

  it("accepts half_day with a session", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(today),
      to: toDateStr(today),
      reason: "Doctor visit",
      unit: "half_day",
      session: "first_half",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short_leave without hours", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(today),
      to: toDateStr(today),
      reason: "Bank work",
      unit: "short_leave",
    });
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(issues.some((i) => i.path.includes("shortLeaveHours"))).toBe(true);
  });

  it("accepts short_leave with hours", () => {
    const result = leaveSchema.safeParse({
      from: toDateStr(today),
      to: toDateStr(today),
      reason: "Bank work",
      unit: "short_leave",
      shortLeaveHours: 2,
    });
    expect(result.success).toBe(true);
  });
});
