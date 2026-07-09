import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import {
  type AttendanceSettings,
  getAttendanceSettings,
  resolveShift,
  calcWorkingHours,
  getUnpaidBreakMinutes,
} from "../utils/attendanceSettings";
import { resolveLeaveConflictForCheckIn } from "../utils/leaveConflict";

dayjs.extend(utc);

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

// ─────────────────────────────────────────────────────────────────────────────

function isLate(t: Date, cfg: AttendanceSettings): boolean {
  const d = dayjs(t);
  const lateMinute =
    cfg.workStartHour * 60 + cfg.workStartMinute + cfg.lateGracePeriodMinutes;
  const actualMinute = d.hour() * 60 + d.minute();
  return actualMinute > lateMinute;
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

      // Everything that could still make check-in fail (geofencing, shift
      // resolution) has already passed at this point — only now is it safe
      // to resolve a same-day leave conflict. A Pending leave is simply
      // withdrawn (it was never approved, so nothing to restore); an
      // Approved leave is treated as a same-day self-service cancellation —
      // the balance is credited back immediately rather than requiring a
      // second manager approval, since a successful check-in is itself
      // strong proof the employee is at work.
      const leaveConflictNote = tenantId
        ? await resolveLeaveConflictForCheckIn(tenantId, userId, todayStart)
        : null;

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
        cacheManager.invalidatePattern("leaves:*"),
      ]);
      return callback(null, {
        message: `${MESSAGES.CHECKED_IN_SUCCESSFULLY}${attendanceStatus === "Late" ? " (late)" : ""}${leaveConflictNote ? ` — ${leaveConflictNote}` : ""}`,
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

      const unpaidBreakMinutes = await getUnpaidBreakMinutes(
        existingRecord.id,
        now,
      );
      const workingHours = calcWorkingHours(
        existingRecord.timeIn,
        now,
        unpaidBreakMinutes,
      );
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
