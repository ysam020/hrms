import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import {
  adjustBalance,
  isCompOffLeaveType,
  consumeCompOffCredits,
} from "./leaveBalanceHelpers";
import { toLeaveApplicationProto } from "./leaveApplicationSerializer";

export const approveLeave = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, approvedById } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.LEAVE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const leave = await prisma.leaveApplication.findUnique({ where: { id } });

    if (!leave) {
      return callback(null, {
        message: MESSAGES.LEAVE_APPLICATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (leave.status !== "Pending") {
      return callback(null, {
        message: MESSAGES.ONLY_PENDING_CAN_BE_APPROVED,
        status: status.FAILED_PRECONDITION,
      });
    }

    const updatedLeave = await prisma.leaveApplication.update({
      where: { id },
      data: {
        status: "Approved",
        approvedById: approvedById || null,
        approvedOn: new Date(),
      },
    });

    await cacheManager.invalidatePattern("leaves:*");

    // Debit the balance — no-op unless this user/leave-type is already
    // balance-tracked (see leaveBalanceHelpers.ts). Comp-off draws down
    // CompOffCredit records instead of the balances JSON.
    const tenantId = getTenantId();
    if (tenantId && isCompOffLeaveType(updatedLeave.leaveType)) {
      await consumeCompOffCredits(
        tenantId,
        updatedLeave.userId,
        updatedLeave.days,
        updatedLeave.id,
      ).catch((err) =>
        logger.warn("[approveLeave] Comp-off credit consumption failed:", {
          err,
        }),
      );
    } else if (tenantId) {
      await adjustBalance(
        tenantId,
        updatedLeave.userId,
        updatedLeave.leaveType,
        -updatedLeave.days,
      ).catch((err) =>
        logger.warn("[approveLeave] Balance debit failed:", { err }),
      );
    }

    getNotificationQueue()
      .add("leaveApproved", {
        title: "Leave",
        message: MESSAGES.LEAVE_APPROVED,
        targetUser: updatedLeave.userId,
        eventType: "leave_notification",
        priority: "medium",
      })
      .catch((err) =>
        logger.error("[approveLeave] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.LEAVE_APPROVED,
      status: status.OK,
      data: toLeaveApplicationProto(updatedLeave),
    });
  } catch (err) {
    logger.error("ApproveLeave error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
