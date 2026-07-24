import { formatDateOrRange } from "../dateRange";

describe("formatDateOrRange", () => {
  it("formats a single day (same from/to) without a dash", () => {
    const d = new Date("2026-07-24T00:00:00.000Z");
    expect(formatDateOrRange(d, d)).toBe("24 Jul 2026");
  });

  it("formats a multi-day range with an en dash", () => {
    const from = new Date("2026-07-24T00:00:00.000Z");
    const to = new Date("2026-07-26T00:00:00.000Z");
    expect(formatDateOrRange(from, to)).toBe("24 Jul 2026 – 26 Jul 2026");
  });

  it("formats in UTC regardless of server-local timezone", () => {
    // 23:30 UTC on the 24th — a naive local-timezone format could roll this
    // over to the 25th depending on where the server runs.
    const d = new Date("2026-07-24T23:30:00.000Z");
    expect(formatDateOrRange(d, d)).toBe("24 Jul 2026");
  });
});
