import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const deleteEmployee = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, hardDelete } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const cacheTenantId = getTenantId() ?? "global";
    const invalidate = () =>
      Promise.all([
        cacheManager.invalidatePattern(`t:${cacheTenantId}:employees:*`),
        cacheManager.delete(`t:${cacheTenantId}:employee:${id}`),
        cacheManager.delete(
          `t:${cacheTenantId}:employee-details:${existingUser.username}`,
        ),
        cacheManager.delete(`t:${cacheTenantId}:dashboard:employee-insights`),
      ]);

    if (hardDelete) {
      // A hard delete would silently orphan this user's historical
      // attendance/leave/payroll rows (no FK cascade at the DB level for
      // MongoDB) — block it if any exist and point the caller at the
      // soft-delete path instead, which is always safe.
      const recordTenantId = existingUser.tenantId;
      const [attendanceCount, leaveCount, salaryCount, payrollCount] =
        await Promise.all([
          prisma.attendanceRecord.count({
            where: { tenantId: recordTenantId, userId: id },
          }),
          prisma.leaveApplication.count({
            where: { tenantId: recordTenantId, userId: id },
          }),
          prisma.salaryStructure.count({
            where: { tenantId: recordTenantId, userId: id },
          }),
          prisma.payrollLineItem.count({
            where: { tenantId: recordTenantId, userId: id },
          }),
        ]);
      if (
        attendanceCount > 0 ||
        leaveCount > 0 ||
        salaryCount > 0 ||
        payrollCount > 0
      ) {
        return callback(null, {
          message: MESSAGES.EMPLOYEE_HAS_HISTORICAL_RECORDS,
          status: status.FAILED_PRECONDITION,
        });
      }

      await prisma.user.delete({ where: { id } });
      await invalidate();
      return callback(null, {
        message: MESSAGES.EMPLOYEE_PERMANENTLY_DELETED,
        status: status.OK,
      });
    }

    await prisma.user.update({
      where: { id },
      data: { employeeStatus: "Terminated" },
    });

    await invalidate();
    return callback(null, {
      message: MESSAGES.EMPLOYEE_DEACTIVATED,
      status: status.OK,
    });
  } catch (err) {
    logger.error("DeleteEmployee error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
