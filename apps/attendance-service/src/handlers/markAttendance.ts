import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

const LATE_THRESHOLD_HOUR = 9;
const LATE_THRESHOLD_MINUTE = 30;

function isLate(t: Date): boolean {
  return (
    t.getHours() > LATE_THRESHOLD_HOUR ||
    (t.getHours() === LATE_THRESHOLD_HOUR &&
      t.getMinutes() > LATE_THRESHOLD_MINUTE)
  );
}

function calcWorkingHours(timeIn: string, timeOut: Date): number {
  const diffMs = timeOut.getTime() - new Date(timeIn).getTime();
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

const isObjectId = (v: string) => /^[0-9a-f]{24}$/i.test(v);

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

    // Resolve username from ObjectId; fall back to treating it as a plain username.
    let username: string | undefined;
    if (isObjectId(userId)) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      username = user?.username;
    } else {
      username = userId;
    }

    if (!username) {
      return callback(null, {
        message: MESSAGES.USERNAME_TYPE_REQUIRED,
        status: status.NOT_FOUND,
      });
    }

    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const existingRecord = await prisma.attendanceRecord.findUnique({
      where: { username_date: { username, date: todayStart } },
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
            data: { timeIn: now.toISOString(), status: attendanceStatus },
          })
        : await prisma.attendanceRecord.create({
            data: {
              username,
              date: todayStart,
              timeIn: now.toISOString(),
              status: attendanceStatus,
            },
          });

      await Promise.all([
        cacheManager.invalidatePattern(`attendance:${username}:*`),
        cacheManager.delete(`todayAttendance:${username}`),
        cacheManager.invalidatePattern(`attendanceSummary:${username}:*`),
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
          timeOut: now.toISOString(),
          workingHours,
          status: isHalfDay ? "Half Day" : existingRecord.status,
        },
      });

      await Promise.all([
        cacheManager.invalidatePattern(`attendance:${username}:*`),
        cacheManager.delete(`todayAttendance:${username}`),
        cacheManager.invalidatePattern(`attendanceSummary:${username}:*`),
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
