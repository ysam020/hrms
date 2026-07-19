import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  prismaWithTenant as prisma,
  getTenantId,
  checkUserHasHistoricalRecords,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const deleteEmployee = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    // The wire field is `employeeId` (see DeleteEmployeeRequest in
    // employee.proto) — destructured to `id` here purely so the rest of
    // this handler doesn't need renaming. Note `hardDelete` isn't a field
    // on DeleteEmployeeRequest at all yet, so it's always undefined from a
    // real gRPC call today; every real invocation takes the soft-delete
    // branch below until that's added to the proto and wired through a
    // gateway route (neither exists yet — this RPC currently has no caller
    // in apps/api-gateway at all).
    const { employeeId: id, hardDelete } = call.request;

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
      // A hard delete would silently orphan this user's historical records
      // (no FK cascade at the DB level for MongoDB) — block it if any exist
      // across every tenant-scoped model that references userId, and point
      // the caller at the soft-delete path instead, which is always safe.
      // See userDeletionGuard.ts — this used to be a hand-picked 4-model
      // subset here, independently hand-copied (and just as incomplete) in
      // user-service's deleteUser.ts.
      const { hasRecords, models } = await checkUserHasHistoricalRecords(
        existingUser.tenantId,
        id,
      );
      if (hasRecords) {
        logger.info("DeleteEmployee blocked: historical records exist", {
          models,
        });
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
