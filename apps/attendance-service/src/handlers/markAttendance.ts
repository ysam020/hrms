import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

// ─── Tenant-settings helpers ──────────────────────────────────────────────────

const SETTINGS_CACHE_TTL = 900; // 15 min

interface AttendanceSettings {
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
async function getAttendanceSettings(
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

// ─── Haversine distance ────────────────────────────────────────────────────────

/**
 * Returns the great-circle distance (in metres) between two GPS coordinates.
 */
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Shift resolution ───────────────────────────────────────────────────────
// Resolution order: User.shiftId > Team.shiftId > TenantSettings defaults.
// A tenant with no Shift rows behaves exactly as before — every check-in
// resolves straight to the tenant-wide cfg.

interface ShiftOverride {
  workStartHour: number;
  workStartMinute: number;
  lateGracePeriodMinutes: number;
  halfDayMinHours: number;
}

async function resolveShift(
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

// ─────────────────────────────────────────────────────────────────────────────

function isLate(t: Date, cfg: AttendanceSettings): boolean {
  const d = dayjs(t);
  const lateMinute =
    cfg.workStartHour * 60 + cfg.workStartMinute + cfg.lateGracePeriodMinutes;
  const actualMinute = d.hour() * 60 + d.minute();
  return actualMinute > lateMinute;
}

function calcWorkingHours(timeIn: Date, timeOut: Date): number {
  const diffMs = dayjs(timeOut).diff(dayjs(timeIn));
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

export const markAttendance = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, type } = call.request;

    if (!userId || !type) {
      return callback(null, {
        message: MESSAGES.USERNAME_TYPE_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const now = new Date();
    const todayStart = dayjs().utc().startOf("day").toDate();
    const tenantId = getTenantId();
    const cfg = await getAttendanceSettings(tenantId ?? null);

    if (!cfg) {
      logger.warn(
        `[markAttendance] No active TenantSettings found for tenant ${tenantId}. ` +
          "Ask an admin to configure Organisation Settings.",
      );
      return callback(null, {
        message:
          "Organisation attendance settings have not been configured yet. " +
          "Please ask your admin to complete the Organisation Settings.",
        status: status.FAILED_PRECONDITION,
      });
    }

    const existingRecord = await prisma.attendanceRecord.findFirst({
      where: { tenantId, userId, date: todayStart },
    });

    if (type === "CHECK_IN") {
      if (existingRecord?.timeIn) {
        return callback(null, {
          message: MESSAGES.ALREADY_CHECKED_IN,
          status: status.ALREADY_EXISTS,
        });
      }

      // Look up the employee's WFH status, home location, branch, shift, and
      // field/remote exemption once — used by both geofencing and shift resolution.
      const employee = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          wfh: true,
          wfhHomeLatitude: true,
          wfhHomeLongitude: true,
          wfhHomeName: true,
          branchId: true,
          shiftId: true,
          attendanceMode: true,
        },
      });
      const attendanceMode = (employee as any)?.attendanceMode ?? "office";

      // ── Geofencing check ────────────────────────────────────────────────────
      // Field/remote employees are exempt entirely — they can't check in from
      // a fixed radius by definition.
      if (cfg.geofencingEnabled && attendanceMode === "office") {
        const { latitude, longitude } = call.request;
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
          return callback(null, {
            message:
              "Location is required for check-in. Please allow location access and try again.",
            status: status.FAILED_PRECONDITION,
          });
        }

        let fenceLat: number | null = null;
        let fenceLng: number | null = null;
        let fenceRadius = cfg.geofenceRadiusMeters;
        let fenceLabel = "office";

        if (employee?.wfh) {
          fenceLat = (employee as any).wfhHomeLatitude ?? null;
          fenceLng = (employee as any).wfhHomeLongitude ?? null;
          fenceLabel = (employee as any).wfhHomeName
            ? `home (${(employee as any).wfhHomeName.split(",")[0]})`
            : "home";
        } else if ((employee as any)?.branchId) {
          const branch = await (prisma as any).branch.findFirst({
            where: { id: (employee as any).branchId, isActive: true },
          });
          if (branch?.latitude != null && branch?.longitude != null) {
            fenceLat = branch.latitude;
            fenceLng = branch.longitude;
            fenceRadius =
              branch.geofenceRadiusMeters ?? cfg.geofenceRadiusMeters;
            fenceLabel = branch.name;
          } else {
            // Branch exists but has no coordinates set — fall back to the
            // tenant-wide legacy office fields rather than blocking outright.
            fenceLat = cfg.officeLatitude;
            fenceLng = cfg.officeLongitude;
          }
        } else {
          fenceLat = cfg.officeLatitude;
          fenceLng = cfg.officeLongitude;
        }

        if (fenceLat == null || fenceLng == null) {
          // Geofencing is on but no reference point saved yet — block and ask admin
          const hint = employee?.wfh
            ? "Ask your admin to set the employee's home location in Employee Management."
            : "Ask your admin to set the branch location in Settings → Branches & Shifts.";
          return callback(null, {
            message: `Geofencing is enabled but no ${fenceLabel} location is configured. ${hint}`,
            status: status.FAILED_PRECONDITION,
          });
        }

        const dist = haversineMeters(lat, lng, fenceLat, fenceLng);
        if (dist > fenceRadius) {
          return callback(null, {
            message: `You are ${Math.round(dist)} m from the ${fenceLabel} (allowed: ${fenceRadius} m). Move closer and try again.`,
            status: status.PERMISSION_DENIED,
          });
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      const shiftOverride = tenantId
        ? await resolveShift(
            tenantId,
            userId,
            (employee as any)?.shiftId ?? null,
          )
        : null;
      const effectiveCfg = shiftOverride ? { ...cfg, ...shiftOverride } : cfg;

      const attendanceStatus = isLate(now, effectiveCfg) ? "Late" : "Present";

      const record = existingRecord
        ? await prisma.attendanceRecord.update({
            where: { id: existingRecord.id },
            data: { timeIn: now, status: attendanceStatus },
          })
        : await prisma.attendanceRecord.create({
            data: {
              tenantId: getTenantId()!,
              userId,
              date: todayStart,
              timeIn: now,
              status: attendanceStatus,
            },
          });

      await Promise.all([
        cacheManager.invalidatePattern(`attendance:${userId}:*`),
        cacheManager.delete(`todayAttendance:${userId}`),
        cacheManager.invalidatePattern(`attendanceSummary:${userId}:*`),
      ]);
      return callback(null, {
        message: `${MESSAGES.CHECKED_IN_SUCCESSFULLY}${attendanceStatus === "Late" ? " (late)" : ""}`,
        status: status.OK,
        data: record,
      });
    }

    if (type === "CHECK_OUT") {
      if (!existingRecord?.timeIn) {
        return callback(null, {
          message: MESSAGES.NO_CHECKIN_FOUND,
          status: status.NOT_FOUND,
        });
      }
      if (existingRecord.timeOut) {
        return callback(null, {
          message: MESSAGES.ALREADY_CHECKED_OUT,
          status: status.ALREADY_EXISTS,
        });
      }

      const userShift = tenantId
        ? await prisma.user.findUnique({
            where: { id: userId },
            select: { shiftId: true },
          })
        : null;
      const shiftOverride =
        tenantId && userShift
          ? await resolveShift(
              tenantId,
              userId,
              (userShift as any)?.shiftId ?? null,
            )
          : null;
      const effectiveHalfDayMinHours =
        shiftOverride?.halfDayMinHours ?? cfg.halfDayMinHours;

      const workingHours = calcWorkingHours(existingRecord.timeIn, now);
      const isHalfDay = workingHours < effectiveHalfDayMinHours;

      const record = await prisma.attendanceRecord.update({
        where: { id: existingRecord.id },
        data: {
          timeOut: now,
          workingHours,
          status: isHalfDay ? "Half Day" : existingRecord.status,
        },
      });

      await Promise.all([
        cacheManager.invalidatePattern(`attendance:${userId}:*`),
        cacheManager.delete(`todayAttendance:${userId}`),
        cacheManager.invalidatePattern(`attendanceSummary:${userId}:*`),
      ]);
      return callback(null, {
        message: MESSAGES.CHECKED_OUT_SUCCESSFULLY,
        status: status.OK,
        data: record,
      });
    }

    return callback(null, {
      message: MESSAGES.INVALID_ATTENDANCE_TYPE,
      status: status.INVALID_ARGUMENT,
    });
  } catch (err) {
    logger.error("MarkAttendance error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_ERROR,
      status: status.INTERNAL,
    });
  }
};
