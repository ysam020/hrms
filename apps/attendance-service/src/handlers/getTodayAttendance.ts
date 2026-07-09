import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export const getTodayAttendance = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.USERNAME_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const todayStart = dayjs().utc().startOf("day").toDate();

    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:todayAttendance:${userId}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const record = await prisma.attendanceRecord.findFirst({
      where: { tenantId: getTenantId(), userId, date: todayStart },
    });

    if (!record) {
      return callback(null, {
        message: MESSAGES.NO_ATTENDANCE_RECORD_TODAY,
        status: status.NOT_FOUND,
        data: {},
      });
    }

    const response = {
      message: MESSAGES.TODAY_ATTENDANCE_FETCHED,
      status: status.OK,
      data: record,
    };
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
