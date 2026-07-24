import crypto from "crypto";
import geoip from "geoip-lite";
import { prisma } from "@hrms/db";
import { sendEmail, PLATFORM_FROM } from "@hrms/common";
import { logger } from "@hrms/logger";
import {
  analyzeLoginRisk,
  NOTIFY_THRESHOLD,
  type LoginMethod,
} from "./loginRiskAnalyzer";
import { buildLoginAlertEmail } from "./loginAlertEmail";

export interface LoginEventInput {
  userId: string;
  ip: string;
  userAgent: string;
  loginMethod: LoginMethod;
}

const HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const HISTORY_MAX_EVENTS = 50;

function fingerprintDevice(userAgent: string): string {
  return crypto.createHash("sha256").update(userAgent).digest("hex");
}

// Strip IPv4-mapped IPv6 prefix so geoip-lite always receives a plain IPv4
// string. "::ffff:1.2.3.4" → "1.2.3.4". Pure IPv6 and loopback pass through.
function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

// RFC-1918 / loopback addresses cannot be geolocated. In local dev (NODE_ENV
// !== "production") callers may set GEOIP_TEST_IP to simulate a real location.
function resolveGeoIp(ip: string): string | null {
  const normalized = normalizeIp(ip);
  if (normalized === "127.0.0.1" || normalized === "::1") {
    return process.env.GEOIP_TEST_IP ?? null;
  }
  if (normalized.startsWith("10.")) return null;
  if (normalized.startsWith("192.168.")) return null;
  const m = normalized.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return null;
  return normalized;
}

export async function recordLoginEvent(input: LoginEventInput): Promise<void> {
  const { userId, userAgent, loginMethod } = input;

  // Normalize before storing — callers may hand us "::ffff:x.x.x.x".
  const ip = normalizeIp(input.ip);

  // Resolve email upfront — single DB read that also serves the notification.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, tenantId: true },
  });
  const userEmail = user?.email ?? null;
  const tenantId = user?.tenantId ?? null;

  const geoIp = resolveGeoIp(ip);
  const geo = geoIp ? geoip.lookup(geoIp) : null;
  const country = geo?.country ?? null;
  const city = geo?.city ?? null;
  const latitude = geo?.ll?.[0] ?? null;
  const longitude = geo?.ll?.[1] ?? null;

  const deviceFingerprint = fingerprintDevice(userAgent);
  const timestamp = new Date();

  const cutoff = new Date(Date.now() - HISTORY_WINDOW_MS);
  const history = await prisma.loginEvent.findMany({
    where: { userId, timestamp: { gte: cutoff } },
    orderBy: { timestamp: "desc" },
    take: HISTORY_MAX_EVENTS,
    select: {
      timestamp: true,
      ip: true,
      country: true,
      city: true,
      latitude: true,
      longitude: true,
      deviceFingerprint: true,
      loginMethod: true,
    },
  });

  const { score, reasons, isAnomaly } = analyzeLoginRisk(
    {
      ip,
      country,
      city,
      latitude,
      longitude,
      deviceFingerprint,
      loginMethod,
      timestamp,
    },
    history,
  );

  if (tenantId) {
    await prisma.loginEvent.create({
      data: {
        tenantId,
        userId,
        userEmail,
        ip,
        country,
        city,
        latitude,
        longitude,
        userAgent,
        deviceFingerprint,
        loginMethod,
        riskScore: score,
        riskReasons: reasons,
        isAnomaly,
      },
    });
  }

  if (!userEmail || score < NOTIFY_THRESHOLD) return;

  const subject = isAnomaly
    ? "Security alert: Suspicious sign-in detected"
    : "New sign-in to your account";

  const html = buildLoginAlertEmail({
    timestamp,
    ip,
    country,
    city,
    userAgent,
    loginMethod,
    isAnomaly,
    riskReasons: reasons,
  });

  await sendEmail({
    to: userEmail,
    subject,
    html,
    from: PLATFORM_FROM,
  }).catch((err) =>
    logger.error("Login alert email failed to send", { userId, err }),
  );
}
