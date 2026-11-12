import {
  DEFAULT_TIME_ZONE,
  addDaysToDateKey,
  isValidTimeZone,
  resolveTimeZone,
  timeZoneOffsetMinutes,
  weekdayOfDateKey,
  zonedDateKey,
  zonedParts,
  zonedStartOfDay,
  zonedTimeToUtc,
} from "../timeZone";

describe("time zone helpers", () => {
  it("validates IANA names and falls back to Asia/Kolkata", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("IST")).toBe(false);
    expect(isValidTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isValidTimeZone("Etc/GMT+5")).toBe(true);
    expect(isValidTimeZone(" Asia/Kolkata")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("Not/AZone")).toBe("Asia/Kolkata");
    expect(resolveTimeZone("Europe/London")).toBe("Europe/London");
  });

  it("does not depend on the process TZ", () => {
    // 2026-11-12T20:00Z is 01:30 on the 13th in India, 20:00 on the 12th in London.
    const t = new Date("2026-11-12T20:00:00Z");
    expect(zonedDateKey(t, "Asia/Kolkata")).toBe("2026-11-13");
    expect(zonedDateKey(t, "Europe/London")).toBe("2026-11-12");
    expect(zonedDateKey(t, "America/Los_Angeles")).toBe("2026-11-12");
    expect(zonedParts(t, "Asia/Kolkata")).toMatchObject({
      hour: 1,
      minute: 30,
      weekday: 5, // Friday
    });
  });

  it("converts tenant wall-clock times to instants", () => {
    // 10:00 IST = 04:30Z
    expect(
      zonedTimeToUtc("2026-11-12", 10, 0, "Asia/Kolkata").toISOString(),
    ).toBe("2026-11-12T04:30:00.000Z");
    // Midnight IST is the previous UTC day.
    expect(zonedStartOfDay("2026-11-12", "Asia/Kolkata").toISOString()).toBe(
      "2026-11-11T18:30:00.000Z",
    );
    expect(zonedTimeToUtc("2026-11-12", 9, 0, "UTC").toISOString()).toBe(
      "2026-11-12T09:00:00.000Z",
    );
  });

  it("lets hours overflow into the next day (shift start + 9h + 1h)", () => {
    // Hour 25 on the 12th = 01:00 IST on the 13th = 19:30Z on the 12th.
    expect(
      zonedTimeToUtc("2026-11-12", 25, 0, "Asia/Kolkata").toISOString(),
    ).toBe("2026-11-12T19:30:00.000Z");
    expect(
      zonedDateKey(
        zonedTimeToUtc("2026-11-12", 25, 0, "Asia/Kolkata"),
        "Asia/Kolkata",
      ),
    ).toBe("2026-11-13");
  });

  it("handles daylight-saving changes (New York, 2026-03-08 and 2026-11-01)", () => {
    // Before and after spring-forward: 09:00 EST = 14:00Z, 09:00 EDT = 13:00Z.
    expect(
      zonedTimeToUtc("2026-03-07", 9, 0, "America/New_York").toISOString(),
    ).toBe("2026-03-07T14:00:00.000Z");
    expect(
      zonedTimeToUtc("2026-03-08", 9, 0, "America/New_York").toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z");
    // 02:30 doesn't exist on spring-forward day: lands on a real instant after the gap.
    const gap = zonedTimeToUtc("2026-03-08", 2, 30, "America/New_York");
    expect(zonedParts(gap, "America/New_York").hour).toBe(3);
    // Overlap on fall-back day: 01:30 happens twice — the earlier (EDT) one.
    expect(
      zonedTimeToUtc("2026-11-01", 1, 30, "America/New_York").toISOString(),
    ).toBe("2026-11-01T05:30:00.000Z");
    // Fall back: 09:00 EST again = 14:00Z.
    expect(
      zonedTimeToUtc("2026-11-02", 9, 0, "America/New_York").toISOString(),
    ).toBe("2026-11-02T14:00:00.000Z");
    expect(
      timeZoneOffsetMinutes(
        new Date("2026-07-01T12:00:00Z"),
        "America/New_York",
      ),
    ).toBe(-240);
    expect(
      timeZoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"), "Asia/Kolkata"),
    ).toBe(330);
  });

  it("does zone-free calendar arithmetic on date keys", () => {
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateKey("2028-03-01", -1)).toBe("2028-02-29");
    expect(weekdayOfDateKey("2026-11-12")).toBe(4); // Thursday
    expect(weekdayOfDateKey("2026-11-15")).toBe(0); // Sunday
  });
});
