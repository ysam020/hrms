import { prismaWithTenant as prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import dayjs from "dayjs";

const SETTINGS_CACHE_TTL = 900; // 15 min

export interface AttendanceSettings {
  workStartHour: number;
  workStartMinute: number;
  lateGracePeriodMinutes: number;
  halfDayMinHours: number;
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

// ─── Shift resolution ───────────────────────────────────────────────────────
// Resolution order: User.shiftId > Team.shiftId > TenantSettings defaults.
// A tenant with no Shift rows behaves exactly as before — every check-in
// resolves straight to the tenant-wide cfg.

export interface ShiftOverride {
  workStartHour: number;
  workStartMinute: number;
  lateGracePeriodMinutes: number;
  halfDayMinHours: number;
}

export async function resolveShift(
  tenantId: string,
  userId: string,
  userShiftId: string | null,
): Promise<ShiftOverride | null> {
  let shiftId = userShiftId;
  if (!shiftId) {
    const team = await (prisma as any).team.findFirst({
      where: { tenantId, members: { has: userId } },
      select: { shiftId: true },
    });
    shiftId = team?.shiftId ?? null;
  }
  if (!shiftId) return null;

  const shift = await (prisma as any).shift.findFirst({
    where: { id: shiftId, tenantId, isActive: true },
  });
  if (!shift) return null;

  return {
    workStartHour: shift.startHour,
    workStartMinute: shift.startMinute,
    lateGracePeriodMinutes: shift.lateGracePeriodMinutes,
    halfDayMinHours: shift.halfDayMinHours,
  };
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
