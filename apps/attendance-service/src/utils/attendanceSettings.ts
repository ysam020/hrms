import { prismaWithTenant as prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import dayjs from "dayjs";

const SETTINGS_CACHE_TTL = 900; // 15 min

export interface AttendanceSettings {
  workStartHour: number;
  workStartMinute: number;
  lateGracePeriodMinutes: number;
  halfDayMinHours: number;
  fullDayMinHours: number;
  overtimePreApprovalRequired: boolean;
  // Geofencing
  geofencingEnabled: boolean;
  officeLatitude: number | null;
  officeLongitude: number | null;
  geofenceRadiusMeters: number;
}

/**
 * Fetches the currently *active* attendance settings from the DB.
 * Active = latest version where effectiveFrom ≤ now.
 * Cached for SETTINGS_CACHE_TTL seconds to keep hot paths fast.
 */
export async function getAttendanceSettings(
  tenantId: string | null,
): Promise<AttendanceSettings | null> {
  if (!tenantId) return null;

  const cacheKey = `tenantSettings:attendance:${tenantId}`;
  const cached = await cacheManager.get(cacheKey);
  if (cached) return cached as AttendanceSettings;

  const settings = await (prisma as any).tenantSettings.findFirst({
    where: { tenantId, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
    select: {
      workStartHour: true,
      workStartMinute: true,
      lateGracePeriodMinutes: true,
      halfDayMinHours: true,
      fullDayMinHours: true,
      overtimePreApprovalRequired: true,
      geofencingEnabled: true,
      officeLatitude: true,
      officeLongitude: true,
      geofenceRadiusMeters: true,
    },
  });

  if (!settings) return null; // Tenant not yet configured — caller handles this.

  const result: AttendanceSettings = {
    workStartHour: settings.workStartHour,
    workStartMinute: settings.workStartMinute,
    lateGracePeriodMinutes: settings.lateGracePeriodMinutes,
    halfDayMinHours: settings.halfDayMinHours,
    fullDayMinHours: settings.fullDayMinHours ?? 8,
    overtimePreApprovalRequired: settings.overtimePreApprovalRequired ?? false,
    geofencingEnabled: settings.geofencingEnabled ?? false,
    officeLatitude: settings.officeLatitude ?? null,
    officeLongitude: settings.officeLongitude ?? null,
    geofenceRadiusMeters: settings.geofenceRadiusMeters ?? 200,
  };

  await cacheManager.set(cacheKey, result, "system", SETTINGS_CACHE_TTL);
  return result;
}

/** Invalidates the cached attendance settings for a tenant — call after any write to TenantSettings. */
export async function invalidateAttendanceSettingsCache(
  tenantId: string,
): Promise<void> {
  await cacheManager.delete(`tenantSettings:attendance:${tenantId}`);
}

// ─── Overtime ───────────────────────────────────────────────────────────────
// Hours worked beyond fullDayMinHours are the overtime candidate for the day.
// When overtimePreApprovalRequired is on, that candidate only counts if an
// approved OvertimeRequest exists for this user+date — otherwise it's
// dropped (the employee worked long, but nothing was pre-approved to pay it
// out for). When the flag is off, the candidate is recognized unconditionally.
export async function resolveOvertimeHours(
  tenantId: string,
  userId: string,
  date: Date,
  workingHours: number,
  cfg: Pick<
    AttendanceSettings,
    "fullDayMinHours" | "overtimePreApprovalRequired"
  >,
): Promise<number> {
  const candidate = Math.max(0, workingHours - cfg.fullDayMinHours);
  if (candidate === 0) return 0;
  if (!cfg.overtimePreApprovalRequired) return candidate;

  const dateStart = dayjs(date).startOf("day").toDate();
  const dateEnd = dayjs(date).endOf("day").toDate();
  const approved = await (prisma as any).overtimeRequest.findFirst({
    where: {
      tenantId,
      userId,
      date: { gte: dateStart, lte: dateEnd },
      status: "Approved",
    },
  });
  if (!approved) return 0;
  // Never pay out more than what was actually approved.
  return Math.min(candidate, approved.plannedHours);
}

// ─── Working hours ──────────────────────────────────────────────────────────

export function calcWorkingHours(
  timeIn: Date,
  timeOut: Date,
  unpaidBreakMinutes = 0,
): number {
  const diffMs = dayjs(timeOut).diff(dayjs(timeIn));
  const netHours = diffMs / (1000 * 60 * 60) - unpaidBreakMinutes / 60;
  return Math.round(Math.max(netHours, 0) * 100) / 100;
}

// Sums unpaid AttendanceBreak time for a day — paid breaks (e.g. a
// contractual lunch) stay inside working hours; unpaid ones (personal
// errands, etc.) must be deducted. A break still open at `upTo` (user forgot
// to end it) counts up to that instant rather than being silently ignored.
export async function getUnpaidBreakMinutes(
  recordId: string,
  upTo: Date,
): Promise<number> {
  const breaks = await (prisma as any).attendanceBreak.findMany({
    where: { attendanceRecordId: recordId, isPaid: false },
  });
  let total = 0;
  for (const b of breaks) {
    if (b.durationMinutes != null) {
      total += b.durationMinutes;
    } else if (b.endTime) {
      total +=
        (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) /
        60000;
    } else {
      total += (upTo.getTime() - new Date(b.startTime).getTime()) / 60000;
    }
  }
  return total;
}
