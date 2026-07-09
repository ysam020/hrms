import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import {
  adjustBalance,
  isCompOffLeaveType,
  restoreCompOffCredits,
} from "./leaveBalanceHelpers";
import { toLeaveApplicationProto } from "./leaveApplicationSerializer";
import { getLeaveSettings } from "../utils/leaveSettings";

/**
 * Called by api-gateway once a "Cancellation Requested" leave has gone
 * through the Approval Chain (module "leave", conditionField "isCancellation").
 * Approved -> actually cancel it and credit the balance back. Rejected ->
 * revert to "Approved", since the employee is still expected to be away.
 */
export const finalizeLeaveCancellation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, approved } = call.request;

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
    if (leave.status !== "Cancellation Requested") {
      // Already finalized (e.g. a double-submit) — treat as success, no-op.
      return callback(null, {
        message: MESSAGES.LEAVE_CANCELLED,
        status: status.OK,
      });
    }

    // Conditioned on status="Cancellation Requested" so two concurrent
    // finalize calls for the same leave (duplicate approval-engine callback)
    // can't both pass the check above and both credit the balance back —
    // only the request that actually flips the status wins.
    const transition = await prisma.leaveApplication.updateMany({
      where: { id, status: "Cancellation Requested" },
      data: approved
        ? { status: "Cancelled", cancelledOn: new Date() }
        : { status: "Approved", cancellationReason: null },
    });
    if (transition.count === 0) {
      return callback(null, {
        message: MESSAGES.LEAVE_CANCELLED,
        status: status.OK,
      });
    }

    const updatedLeave = await prisma.leaveApplication.findUniqueOrThrow({
      where: { id },
    });

    if (approved) {
      const tenantId = getTenantId();
      const leavePolicies = tenantId
        ? (await getLeaveSettings(tenantId))?.leavePolicies
        : undefined;
      if (tenantId && isCompOffLeaveType(leave.leaveType, leavePolicies)) {
        await restoreCompOffCredits(leave.id).catch((err) =>
          logger.warn(
            "[finalizeLeaveCancellation] Comp-off credit restore failed:",
            { err },
          ),
        );
      } else if (tenantId) {
        await adjustBalance(
          tenantId,
          leave.userId,
          leave.leaveType,
          leave.days,
        ).catch((err) =>
          logger.warn("[finalizeLeaveCancellation] Balance credit failed:", {
            err,
          }),
        );
      }
    }

    await cacheManager.invalidatePattern(
      `t:${getTenantId() ?? "global"}:leaves:*`,
    );

    getNotificationQueue()
      .add(approved ? "leaveCancelled" : "leaveCancellationRejected", {
        title: "Leave",
        message: approved
          ? "Your leave cancellation was approved."
          : "Your leave cancellation request was rejected — the leave remains approved.",
        targetUser: updatedLeave.userId,
        eventType: "leave_notification",
        priority: "medium",
      })
      .catch((err) =>
        logger.warn(
          "[finalizeLeaveCancellation] Notification enqueue failed:",
          { err },
        ),
      );

    return callback(null, {
      message: approved ? MESSAGES.LEAVE_CANCELLED : MESSAGES.LEAVE_APPROVED,
      status: status.OK,
      data: toLeaveApplicationProto(updatedLeave),
    });
  } catch (err) {
    logger.error("FinalizeLeaveCancellation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
