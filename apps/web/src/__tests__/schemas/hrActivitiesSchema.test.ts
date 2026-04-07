import { hrActivitiesSchema } from "@web/shared/schemas/hrActivities";

// Format as local YYYY-MM-DD to avoid UTC parsing failures in non-UTC timezones
const toLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const today = new Date();
today.setHours(12, 0, 0, 0);
const todayStr = toLocalDateStr(today);

const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);
const yesterdayStr = toLocalDateStr(yesterday);

describe("hrActivitiesSchema", () => {
  it("accepts valid HR activity", () => {
    const result = hrActivitiesSchema.safeParse({
      title: "Team Building Workshop",
      description: "A full-day workshop for team bonding and collaboration.",
      date: todayStr,
      time: "09:30",
    });
    expect(result.success).toBe(true);
  });

  it("rejects title shorter than 3 characters", () => {
    const result = hrActivitiesSchema.safeParse({
      title: "Hi",
      description: "Valid description text here",
      date: todayStr,
      time: "10:00",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("at least 3");
  });

  it("rejects title longer than 50 characters", () => {
    const result = hrActivitiesSchema.safeParse({
      title: "A".repeat(51),
      description: "Valid description text here",
      date: todayStr,
      time: "10:00",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("cannot exceed 50");
  });

  it("rejects description shorter than 10 characters", () => {
    const result = hrActivitiesSchema.safeParse({
      title: "Valid Title",
      description: "Too short",
      date: todayStr,
      time: "10:00",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("at least 10");
  });

  it("rejects description longer than 200 characters", () => {
    const result = hrActivitiesSchema.safeParse({
      title: "Valid Title",
      description: "A".repeat(201),
      date: todayStr,
      time: "10:00",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("cannot exceed 200");
  });

  it("rejects date in the past", () => {
    const result = hrActivitiesSchema.safeParse({
      title: "Past Event",
      description: "This event was in the past and should be rejected.",
      date: yesterdayStr,
      time: "10:00",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Date cannot be in the past",
    );
  });

  it("rejects invalid time format", () => {
    const result = hrActivitiesSchema.safeParse({
      title: "Good Title",
      description: "Valid description for this activity.",
      date: todayStr,
      time: "9:30",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Invalid time");
  });

  it("rejects time 24:00", () => {
    const result = hrActivitiesSchema.safeParse({
      title: "Good Title",
      description: "Valid description for this activity.",
      date: todayStr,
      time: "24:00",
    });
    expect(result.success).toBe(false);
  });
});
