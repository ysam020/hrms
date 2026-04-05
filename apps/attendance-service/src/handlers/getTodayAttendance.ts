import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const getTodayAttendance = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { username } = call.request;

    if (!username) {
      return callback(null, {
        message: MESSAGES.USERNAME_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const cacheKey = `todayAttendance:${username}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const record = await prisma.attendanceRecord.findUnique({
      where: { username_date: { username, date: todayStart } },
    });

    if (!record) {
      return callback(null, {
        message: MESSAGES.NO_ATTENDANCE_RECORD_TODAY,
        status: status.NOT_FOUND,
        data: null,
      });
    }

    const response = {
      message: MESSAGES.TODAY_ATTENDANCE_FETCHED,
      status: status.OK,
      data: record,
    };
    // Short TTL: today's record can change on check-out
    await cacheManager.set(cacheKey, response, "notification");
    return callback(null, response);
  } catch (err) {
    logger.error("GetTodayAttendance error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_ERROR,
      status: status.INTERNAL,
    });
  }
};
