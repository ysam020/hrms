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
import { getLeaveSettings } from "../utils/leaveSettings";

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

    // Resolved before the transaction — a read-through cache lookup, not a
    // write, so it doesn't need to participate in it. isCompOffLeaveType
    // needs leavePolicies to recognize a tenant-defined comp-off type (not
    // just the legacy literal "COMP_OFF" key), so it must agree with apply.
    const tenantId = getTenantId();
    const leavePolicies = tenantId
      ? (await getLeaveSettings(tenantId))?.leavePolicies
      : undefined;

    // Status flip + balance debit must land together: a debit that succeeds
    // while the status flip is lost (or vice versa) leaves the leave
    // application and the employee's balance permanently disagreeing about
    // whether this leave was ever approved.
    const result = await prisma.$transaction(async (tx) => {
      // Conditioned on status="Pending" so two concurrent approvals of the
      // same leave (duplicate approval-engine callback, admin double-click)
      // can't both pass the check above and both debit the balance — only
      // the request that actually flips the status wins.
      const transition = await tx.leaveApplication.updateMany({
        where: { id, status: "Pending" },
        data: {
          status: "Approved",
          approvedById: approvedById || null,
          approvedOn: new Date(),
        },
      });
      if (transition.count === 0) {
        return { approved: false as const };
      }

      const updatedLeave = await tx.leaveApplication.findUniqueOrThrow({
        where: { id },
      });

      // Debit the balance — no-op unless this user/leave-type is already
      // balance-tracked (see leaveBalanceHelpers.ts). Comp-off draws down
      // CompOffCredit records instead of the balances JSON.
      if (
        tenantId &&
        isCompOffLeaveType(updatedLeave.leaveType, leavePolicies)
      ) {
        await consumeCompOffCredits(
          tenantId,
          updatedLeave.userId,
          updatedLeave.days,
          updatedLeave.id,
          tx,
        );
      } else if (tenantId) {
        await adjustBalance(
          tenantId,
          updatedLeave.userId,
          updatedLeave.leaveType,
          -updatedLeave.days,
          tx,
        );
      }

      return { approved: true as const, updatedLeave };
    });

    if (!result.approved) {
      return callback(null, {
        message: MESSAGES.ONLY_PENDING_CAN_BE_APPROVED,
        status: status.FAILED_PRECONDITION,
      });
    }
    const { updatedLeave } = result;

    await cacheManager.invalidatePattern(
      `t:${getTenantId() ?? "global"}:leaves:*`,
    );

    getNotificationQueue()
      .add("leaveApproved", {
        tenantId: getTenantId()!,
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
