import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { instantiateApproval, cancelApproval } from "@hrms/approval-engine";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import { toLeaveApplicationProto } from "./leaveApplicationSerializer";

async function notifyCancellationRequested(
  tenantId: string,
  requestedByUserId: string,
  leave: { userId: string; approvedById: string | null; from: Date; to: Date },
): Promise<void> {
  const [requester, hrUsers, approver] = await Promise.all([
    (prisma as any).user.findUnique({
      where: { id: leave.userId },
      select: { username: true },
    }),
    (prisma as any).user.findMany({
      where: { tenantId, department: "HUMAN RESOURCES" },
      select: { id: true, username: true },
    }),
    leave.approvedById
      ? (prisma as any).user.findUnique({
          where: { id: leave.approvedById },
          select: { id: true, username: true },
        })
      : null,
  ]);

  const targets = approver ? [...hrUsers, approver] : hrUsers;
  const uniqueIds = [...new Set(targets.map((u: any) => u.id))];
  const uniqueUsernames = [...new Set(targets.map((u: any) => u.username))];
  if (uniqueUsernames.length === 0) return;

  const fromStr = leave.from.toISOString().split("T")[0];
  const toStr = leave.to.toISOString().split("T")[0];

  await getNotificationQueue().add("leaveCancellationRequested", {
    title: "Leave",
    message: `${requester?.username || requestedByUserId} has requested to cancel their approved leave from ${fromStr} to ${toStr}.`,
    recipients: uniqueIds,
    pushTargets: uniqueUsernames,
    eventType: "leave_notification",
    priority: "medium",
  });
}

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
      await cacheManager.invalidatePattern(
        `t:${tenantId ?? "global"}:leaves:*`,
      );
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
      notifyCancellationRequested(tenantId, userId || leave.userId, {
        userId: leave.userId,
        approvedById: leave.approvedById,
        from: leave.from,
        to: leave.to,
      }).catch((err) =>
        logger.warn("[cancelLeave] Notification enqueue failed:", { err }),
      );
      await cacheManager.invalidatePattern(
        `t:${tenantId ?? "global"}:leaves:*`,
      );
      return callback(null, {
        message: MESSAGES.LEAVE_CANCELLATION_REQUESTED,
        status: status.OK,
        data: toLeaveApplicationProto(updatedLeave),
      });
    }

    return callback(null, {
      message: MESSAGES.CANNOT_CANCEL_IN_CURRENT_STATE,
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
