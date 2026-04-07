import { addEventSchema } from "@web/shared/schemas/addEvent";

// Format as local YYYY-MM-DD to avoid UTC parsing failures in non-UTC timezones
const toLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const today = new Date();
today.setHours(12, 0, 0, 0); // use noon to ensure parsed date is unambiguously today in any timezone
const todayStr = toLocalDateStr(today);

const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);
const yesterdayStr = toLocalDateStr(yesterday);

describe("addEventSchema", () => {
  it("accepts valid event", () => {
    const result = addEventSchema.safeParse({
      title: "Team Meeting",
      date: todayStr,
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects past date", () => {
    const result = addEventSchema.safeParse({
      title: "Old Event",
      date: yesterdayStr,
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Date cannot be in the past",
    );
  });

  it("rejects date in wrong format", () => {
    const result = addEventSchema.safeParse({
      title: "Bad Date",
      date: "15-03-2024",
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("YYYY-MM-DD");
  });

  it("rejects invalid startTime format", () => {
    const result = addEventSchema.safeParse({
      title: "Bad Time",
      date: todayStr,
      startTime: "9:00",
      endTime: "10:00",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("HH:MM");
  });

  it("rejects endTime before startTime", () => {
    const result = addEventSchema.safeParse({
      title: "Bad Range",
      date: todayStr,
      startTime: "10:00",
      endTime: "09:00",
    });
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(
      issues.some(
        (i) => i.path.includes("endTime") && i.message.includes("later than"),
      ),
    ).toBe(true);
  });

  it("rejects endTime equal to startTime", () => {
    const result = addEventSchema.safeParse({
      title: "Same Time",
      date: todayStr,
      startTime: "10:00",
      endTime: "10:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = addEventSchema.safeParse({
      title: "",
      date: todayStr,
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Title is required");
  });

  it("accepts optional description", () => {
    const result = addEventSchema.safeParse({
      title: "Meeting",
      date: todayStr,
      startTime: "09:00",
      endTime: "10:00",
      description: "Monthly sync",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid 24-hour boundary times (00:00 to 23:59)", () => {
    const result = addEventSchema.safeParse({
      title: "Night Shift",
      date: todayStr,
      startTime: "00:00",
      endTime: "23:59",
    });
    expect(result.success).toBe(true);
  });
});
