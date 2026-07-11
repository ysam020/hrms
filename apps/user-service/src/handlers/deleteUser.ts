import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const deleteUser = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return callback(null, {
        message: MESSAGES.USER_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    // A hard delete would silently orphan this user's historical
    // attendance/leave/payroll rows (no FK cascade at the DB level for
    // MongoDB) — block it if any exist.
    const [attendanceCount, leaveCount, salaryCount, payrollCount] =
      await Promise.all([
        prisma.attendanceRecord.count({
          where: { tenantId: user.tenantId, userId },
        }),
        prisma.leaveApplication.count({
          where: { tenantId: user.tenantId, userId },
        }),
        prisma.salaryStructure.count({
          where: { tenantId: user.tenantId, userId },
        }),
        prisma.payrollLineItem.count({
          where: { tenantId: user.tenantId, userId },
        }),
      ]);
    if (
      attendanceCount > 0 ||
      leaveCount > 0 ||
      salaryCount > 0 ||
      payrollCount > 0
    ) {
      return callback(null, {
        message: MESSAGES.USER_HAS_HISTORICAL_RECORDS,
        status: status.FAILED_PRECONDITION,
      });
    }

    await prisma.user.delete({ where: { id: userId } });

    const tenantId = getTenantId() ?? "global";
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:users:*`),
      cacheManager.delete(`t:${tenantId}:user:v6:${userId}`),
    ]);
    return callback(null, {
      message: MESSAGES.USER_DELETED,
      status: status.OK,
    });
  } catch (err) {
    logger.error("DeleteUser error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
