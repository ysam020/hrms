import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { instantiateApproval, cancelApproval } from "@hrms/approval-engine";
import { MESSAGES } from "../constants/messages";
import { toLeaveApplicationProto } from "./leaveApplicationSerializer";

export const cancelLeave = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, userId, reason } = call.request;

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

    if (userId && leave.userId !== userId) {
      return callback(null, {
        message: MESSAGES.CANNOT_CANCEL_OTHERS_LEAVE,
        status: status.PERMISSION_DENIED,
      });
    }

    // Pending → cancel immediately, same as before. Also cancels the
    // apply-time ApprovalInstance (see applyLeave.ts) so it stops showing up
    // as a pending approval for a leave that no longer exists in that state.
    if (leave.status === "Pending") {
      const updatedLeave = await prisma.leaveApplication.update({
        where: { id },
        data: {
          status: "Cancelled",
          cancelledOn: new Date(),
          cancelledBy: userId || null,
          cancellationReason: reason || null,
        },
      });
      const tenantId = getTenantId();
      if (tenantId) {
        const instance = await (prisma as any).approvalInstance.findFirst({
          where: { tenantId, module: "leave", entityId: id, status: "pending" },
        });
        if (instance) {
          await cancelApproval(instance.id).catch((err) =>
            logger.warn(
              "[cancelLeave] Failed to cancel pending approval instance:",
              { err },
            ),
          );
        }
      }
      await cacheManager.invalidatePattern("leaves:*");
      return callback(null, {
        message: MESSAGES.LEAVE_CANCELLED,
        status: status.OK,
        data: toLeaveApplicationProto(updatedLeave),
      });
    }

    // Approved → requires approval before it's actually cancelled and the
    // balance is credited back, so a rejected cancellation doesn't silently
    // leave the employee un-covered for dates they've already told people
    // they'd be away for.
    if (leave.status === "Approved") {
      const tenantId = getTenantId();
      if (!tenantId) {
        return callback(null, {
          message: MESSAGES.INTERNAL_SERVER_ERROR,
          status: status.INTERNAL,
        });
      }
      const updatedLeave = await prisma.leaveApplication.update({
        where: { id },
        data: {
          status: "Cancellation Requested",
          cancellationReason: reason || null,
        },
      });
      await instantiateApproval(tenantId, "leave", id, leave.userId, {
        isCancellation: true,
      });
      await cacheManager.invalidatePattern("leaves:*");
      return callback(null, {
        message: MESSAGES.LEAVE_CANCELLATION_REQUESTED,
        status: status.OK,
        data: toLeaveApplicationProto(updatedLeave),
      });
    }

    return callback(null, {
      message: MESSAGES.ONLY_PENDING_CAN_BE_CANCELLED,
      status: status.FAILED_PRECONDITION,
    });
  } catch (err) {
    logger.error("CancelLeave error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
