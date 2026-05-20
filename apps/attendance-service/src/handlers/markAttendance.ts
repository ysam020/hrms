import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

const LATE_THRESHOLD_HOUR = 9;
const LATE_THRESHOLD_MINUTE = 30;

function isLate(t: Date): boolean {
  const d = dayjs(t);
  return (
    d.hour() > LATE_THRESHOLD_HOUR ||
    (d.hour() === LATE_THRESHOLD_HOUR && d.minute() > LATE_THRESHOLD_MINUTE)
  );
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

    const existingRecord = await prisma.attendanceRecord.findFirst({
      where: { tenantId: getTenantId(), userId, date: todayStart },
    });

    if (type === "CHECK_IN") {
      if (existingRecord?.timeIn) {
        return callback(null, {
          message: MESSAGES.ALREADY_CHECKED_IN,
          status: status.ALREADY_EXISTS,
        });
      }

      const attendanceStatus = isLate(now) ? "Late" : "Present";

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

      const workingHours = calcWorkingHours(existingRecord.timeIn, now);
      const isHalfDay = workingHours < 4;

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
