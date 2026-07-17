import {
  analyzeLoginRisk,
  NOTIFY_THRESHOLD,
  ANOMALY_THRESHOLD,
  type CurrentLoginContext,
  type HistoricalLoginEvent,
} from "../services/loginRiskAnalyzer";

const BASE_CURRENT: CurrentLoginContext = {
  ip: "203.0.113.10",
  country: "IN",
  city: "Mumbai",
  latitude: 19.076,
  longitude: 72.8777,
  deviceFingerprint: "device-1",
  loginMethod: "WEBAUTHN",
  timestamp: new Date("2026-06-15T10:00:00Z"),
};

function makeHistoryEvent(
  overrides: Partial<HistoricalLoginEvent> = {},
): HistoricalLoginEvent {
  return {
    timestamp: new Date("2026-06-14T10:00:00Z"),
    ip: "203.0.113.10",
    country: "IN",
    city: "Mumbai",
    latitude: 19.076,
    longitude: 72.8777,
    deviceFingerprint: "device-1",
    loginMethod: "WEBAUTHN",
    ...overrides,
  };
}

describe("analyzeLoginRisk", () => {
  it("returns a zero baseline score with no history (first-ever login)", () => {
    const result = analyzeLoginRisk(BASE_CURRENT, []);
    expect(result).toEqual({ score: 0, reasons: [], isAnomaly: false });
  });

  it("returns zero score/no reasons when everything matches known history", () => {
    const result = analyzeLoginRisk(BASE_CURRENT, [makeHistoryEvent()]);
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
    expect(result.isAnomaly).toBe(false);
  });

  it("flags impossible travel: far apart within the time window", () => {
    const history = [
      makeHistoryEvent({
        timestamp: new Date("2026-06-15T08:00:00Z"), // 2h before current
        latitude: 51.5074, // London
        longitude: -0.1278,
        city: "London",
      }),
    ];
    const result = analyzeLoginRisk(BASE_CURRENT, history); // current is Mumbai
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.reasons.some((r) => r.includes("Impossible travel"))).toBe(
      true,
    );
  });

  it("does not flag impossible travel when the distance is short", () => {
    const history = [
      makeHistoryEvent({
        timestamp: new Date("2026-06-15T08:00:00Z"),
        latitude: 19.08, // essentially the same city
        longitude: 72.88,
      }),
    ];
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.reasons.some((r) => r.includes("Impossible travel"))).toBe(
      false,
    );
  });

  it("does not flag impossible travel outside the time window", () => {
    const history = [
      makeHistoryEvent({
        timestamp: new Date("2026-06-14T00:00:00Z"), // 34h before — outside 6h window
        latitude: 51.5074,
        longitude: -0.1278,
      }),
    ];
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.reasons.some((r) => r.includes("Impossible travel"))).toBe(
      false,
    );
  });

  it("does not flag impossible travel when the current login is earlier than history (negative hoursApart)", () => {
    const history = [
      makeHistoryEvent({
        timestamp: new Date("2026-06-15T12:00:00Z"), // after current
        latitude: 51.5074,
        longitude: -0.1278,
      }),
    ];
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.reasons.some((r) => r.includes("Impossible travel"))).toBe(
      false,
    );
  });

  it("flags a new country not seen in history", () => {
    const history = [
      makeHistoryEvent({ country: "US", latitude: null, longitude: null }),
    ];
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(
      result.reasons.some((r) => r.includes("First sign-in from IN")),
    ).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(35);
  });

  it("flags a new device fingerprint", () => {
    const history = [makeHistoryEvent({ deviceFingerprint: "device-old" })];
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.reasons).toContain("Sign-in from an unrecognized device");
  });

  it("flags a new IP subnet", () => {
    const history = [makeHistoryEvent({ ip: "198.51.100.5" })];
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.reasons).toContain("Sign-in from a new network");
  });

  it("does not flag IP subnet when only the last octet differs", () => {
    const history = [makeHistoryEvent({ ip: "203.0.113.99" })]; // same /24 as 203.0.113.10
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.reasons).not.toContain("Sign-in from a new network");
  });

  it("flags a new authentication method", () => {
    const history = [makeHistoryEvent({ loginMethod: "GOOGLE_OAUTH" })];
    const result = analyzeLoginRisk(BASE_CURRENT, history); // current is WEBAUTHN
    expect(result.reasons.some((r) => r.includes("passkey"))).toBe(true);
  });

  it("labels a new Google OAuth method distinctly from passkey", () => {
    const current = { ...BASE_CURRENT, loginMethod: "GOOGLE_OAUTH" as const };
    const history = [makeHistoryEvent({ loginMethod: "WEBAUTHN" })];
    const result = analyzeLoginRisk(current, history);
    expect(result.reasons.some((r) => r.includes("Google OAuth"))).toBe(true);
  });

  it("only checks unusual-hour when there's enough history (>= 15 events)", () => {
    // Only 5 events, all at a different hour than current — should NOT flag
    // since history is below MIN_HISTORY_FOR_HOUR_CHECK.
    const history = Array.from({ length: 5 }, () =>
      makeHistoryEvent({ timestamp: new Date("2026-06-01T02:00:00Z") }),
    );
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.reasons.some((r) => r.includes("Unusual sign-in time"))).toBe(
      false,
    );
  });

  it("flags an unusual login hour when history is sufficient and the hour bucket is rare", () => {
    // 20 events all in hour-bucket 0 (00:00-03:00 UTC); current login is at
    // 10:00 UTC (bucket 3) — 0% of history falls in that bucket.
    const history = Array.from({ length: 20 }, () =>
      makeHistoryEvent({ timestamp: new Date("2026-06-01T01:00:00Z") }),
    );
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.reasons.some((r) => r.includes("Unusual sign-in time"))).toBe(
      true,
    );
  });

  it("does not flag hour when the current bucket is well-represented in history", () => {
    // 20 events spread evenly across all 8 buckets (so each bucket >= 10%).
    const history = Array.from({ length: 20 }, (_, i) =>
      makeHistoryEvent({
        timestamp: new Date(Date.UTC(2026, 5, 1, (i % 8) * 3)),
      }),
    );
    const result = analyzeLoginRisk(BASE_CURRENT, history); // bucket 3 (10:00 UTC)
    expect(result.reasons.some((r) => r.includes("Unusual sign-in time"))).toBe(
      false,
    );
  });

  it("caps the total score at 100 even when every signal fires", () => {
    const history = [
      makeHistoryEvent({
        country: "US",
        deviceFingerprint: "device-old",
        ip: "198.51.100.5",
        loginMethod: "GOOGLE_OAUTH",
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date("2026-06-15T08:00:00Z"),
      }),
      ...Array.from({ length: 20 }, () =>
        makeHistoryEvent({
          timestamp: new Date("2026-06-01T01:00:00Z"),
          country: "US",
        }),
      ),
    ];
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.isAnomaly).toBe(true);
  });

  it("marks isAnomaly true once score reaches the anomaly threshold", () => {
    // New country (35) + new device (20) = 55 >= ANOMALY_THRESHOLD (50)
    const history = [
      makeHistoryEvent({
        country: "US",
        deviceFingerprint: "device-old",
        latitude: null,
        longitude: null,
      }),
    ];
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.score).toBeGreaterThanOrEqual(ANOMALY_THRESHOLD);
    expect(result.isAnomaly).toBe(true);
  });

  it("does not treat a below-notify-threshold score as an anomaly", () => {
    // Only new IP subnet (10) fires — below NOTIFY_THRESHOLD (30) and ANOMALY_THRESHOLD (50)
    const history = [makeHistoryEvent({ ip: "198.51.100.5" })];
    const result = analyzeLoginRisk(BASE_CURRENT, history);
    expect(result.score).toBeLessThan(NOTIFY_THRESHOLD);
    expect(result.isAnomaly).toBe(false);
  });

  it("ignores impossible-travel check when the current login has no coordinates", () => {
    const current = { ...BASE_CURRENT, latitude: null, longitude: null };
    const history = [
      makeHistoryEvent({
        timestamp: new Date("2026-06-15T08:00:00Z"),
        latitude: 51.5074,
        longitude: -0.1278,
      }),
    ];
    const result = analyzeLoginRisk(current, history);
    expect(result.reasons.some((r) => r.includes("Impossible travel"))).toBe(
      false,
    );
  });

  it("skips the new-country check when current.country is null", () => {
    const current = { ...BASE_CURRENT, country: null };
    const history = [makeHistoryEvent({ country: "US" })];
    const result = analyzeLoginRisk(current, history);
    expect(result.reasons.some((r) => r.includes("First sign-in from"))).toBe(
      false,
    );
  });
});
