import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  prismaWithTenant as prisma,
  getTenantId,
  checkUserHasHistoricalRecords,
} from "@hrms/db";
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

    // A hard delete would silently orphan this user's historical records
    // (no FK cascade at the DB level for MongoDB) — block it if any exist
    // across every tenant-scoped model that references userId, not just a
    // hand-picked subset (see userDeletionGuard.ts for why that subset drifts,
    // and for why the check-then-delete gap below isn't wrapped in a
    // transaction — it spans two separate database connections and can't be).
    //
    // Unlike deleteEmployee.ts (which offers a soft-delete path via
    // employeeStatus: "Terminated" for HR lifecycle continuity), this
    // handler only ever hard-deletes: DeleteUserRequest has no hardDelete
    // field, and "delete user" here means removing a login account
    // entirely, not transitioning an employee's status — there's no
    // equivalent soft state for a User row outside the employee context.
    // That's an intentional difference in what the two RPCs represent, not
    // configuration drift between two implementations of the same thing.
    const { hasRecords, models } = await checkUserHasHistoricalRecords(
      user.tenantId,
      userId,
    );
    if (hasRecords) {
      logger.info("DeleteUser blocked: historical records exist", { models });
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
