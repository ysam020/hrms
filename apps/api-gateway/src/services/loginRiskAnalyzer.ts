export type LoginMethod = "GOOGLE_OAUTH" | "WEBAUTHN";

export interface HistoricalLoginEvent {
  timestamp: Date;
  ip: string;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  deviceFingerprint: string;
  loginMethod: string;
}

export interface CurrentLoginContext {
  ip: string;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  deviceFingerprint: string;
  loginMethod: LoginMethod;
  timestamp: Date;
}

export interface RiskAssessment {
  score: number;
  reasons: string[];
  isAnomaly: boolean;
}

const RISK_WEIGHTS = {
  IMPOSSIBLE_TRAVEL: 60,
  NEW_COUNTRY: 35,
  NEW_DEVICE: 20,
  UNUSUAL_HOUR: 15,
  NEW_IP_SUBNET: 10,
  NEW_AUTH_METHOD: 10,
} as const;

export const NOTIFY_THRESHOLD = 30;
export const ANOMALY_THRESHOLD = 50;

const IMPOSSIBLE_TRAVEL_WINDOW_HOURS = 6;
const IMPOSSIBLE_TRAVEL_MIN_KM = 500;
const MIN_HISTORY_FOR_HOUR_CHECK = 15;
const UNUSUAL_HOUR_BUCKET_FRACTION = 0.1;

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

// Returns the first 3 octets of an IPv4 address (the /24 subnet).
// For IPv6, returns the first 4 groups as a coarse approximation.
function ipSubnet(ip: string): string {
  const v4Parts = ip.split(".");
  if (v4Parts.length === 4) return v4Parts.slice(0, 3).join(".");
  return ip.split(":").slice(0, 4).join(":");
}

// Buckets a Date's UTC hour into one of 8 three-hour windows (0–7).
function hourBucket(d: Date): number {
  return Math.floor(d.getUTCHours() / 3);
}

export function analyzeLoginRisk(
  current: CurrentLoginContext,
  history: HistoricalLoginEvent[],
): RiskAssessment {
  if (history.length === 0) {
    // First recorded login — establish baseline with no risk signal.
    return { score: 0, reasons: [], isAnomaly: false };
  }

  const reasons: string[] = [];
  let score = 0;

  // ── 1. Impossible travel ─────────────────────────────────────────────────
  if (current.latitude !== null && current.longitude !== null) {
    const prevWithCoords = history
      .filter((e) => e.latitude !== null && e.longitude !== null)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (prevWithCoords) {
      const hoursApart =
        (current.timestamp.getTime() - prevWithCoords.timestamp.getTime()) /
        3_600_000;

      if (hoursApart > 0 && hoursApart < IMPOSSIBLE_TRAVEL_WINDOW_HOURS) {
        const km = haversineKm(
          prevWithCoords.latitude!,
          prevWithCoords.longitude!,
          current.latitude,
          current.longitude,
        );
        if (km > IMPOSSIBLE_TRAVEL_MIN_KM) {
          score += RISK_WEIGHTS.IMPOSSIBLE_TRAVEL;
          const from =
            prevWithCoords.city || prevWithCoords.country || prevWithCoords.ip;
          const to = current.city || current.country || current.ip;
          reasons.push(
            `Impossible travel: ${Math.round(km)} km in ${hoursApart.toFixed(1)} h (${from} → ${to})`,
          );
        }
      }
    }
  }

  // ── 2. New country ───────────────────────────────────────────────────────
  if (current.country) {
    const knownCountries = new Set(
      history.map((e) => e.country).filter(Boolean),
    );
    if (!knownCountries.has(current.country)) {
      score += RISK_WEIGHTS.NEW_COUNTRY;
      reasons.push(`First sign-in from ${current.country}`);
    }
  }

  // ── 3. New device fingerprint ────────────────────────────────────────────
  const knownDevices = new Set(history.map((e) => e.deviceFingerprint));
  if (!knownDevices.has(current.deviceFingerprint)) {
    score += RISK_WEIGHTS.NEW_DEVICE;
    reasons.push("Sign-in from an unrecognized device");
  }

  // ── 4. Unusual login hour ────────────────────────────────────────────────
  if (history.length >= MIN_HISTORY_FOR_HOUR_CHECK) {
    const bucketCounts = new Array<number>(8).fill(0);
    for (const e of history) {
      bucketCounts[hourBucket(e.timestamp)]++;
    }
    const currentBucket = hourBucket(current.timestamp);
    const fraction = bucketCounts[currentBucket] / history.length;
    if (fraction < UNUSUAL_HOUR_BUCKET_FRACTION) {
      score += RISK_WEIGHTS.UNUSUAL_HOUR;
      const h = current.timestamp.getUTCHours();
      reasons.push(
        `Unusual sign-in time (${String(h).padStart(2, "0")}:00 UTC)`,
      );
    }
  }

  // ── 5. New IP subnet ─────────────────────────────────────────────────────
  const currentSubnet = ipSubnet(current.ip);
  const knownSubnets = new Set(history.map((e) => ipSubnet(e.ip)));
  if (!knownSubnets.has(currentSubnet)) {
    score += RISK_WEIGHTS.NEW_IP_SUBNET;
    reasons.push("Sign-in from a new network");
  }

  // ── 6. New authentication method ─────────────────────────────────────────
  const knownMethods = new Set(history.map((e) => e.loginMethod));
  if (!knownMethods.has(current.loginMethod)) {
    score += RISK_WEIGHTS.NEW_AUTH_METHOD;
    const label =
      current.loginMethod === "GOOGLE_OAUTH" ? "Google OAuth" : "passkey";
    reasons.push(`First sign-in using ${label}`);
  }

  const finalScore = Math.min(score, 100);
  return {
    score: finalScore,
    reasons,
    isAnomaly: finalScore >= ANOMALY_THRESHOLD,
  };
}
