import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { notify } from "@hrms/notifications";
import {
  tenantFrom,
  tenantReplyTo,
  renderEmailHtml,
  formatDateOrRange,
} from "@hrms/common";
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

    // Resolved before the transaction — a read-through cache lookup, not a
    // write, so it doesn't need to participate in it.
    const tenantId = getTenantId();
    const leavePolicies =
      approved && tenantId
        ? (await getLeaveSettings(tenantId))?.leavePolicies
        : undefined;

    // Status flip + balance credit-back must land together: a credit that
    // succeeds while the status flip is lost (or vice versa) leaves the
    // leave application and the employee's balance permanently disagreeing
    // about whether this cancellation was ever finalized.
    const result = await prisma.$transaction(async (tx) => {
      // Conditioned on status="Cancellation Requested" so two concurrent
      // finalize calls for the same leave (duplicate approval-engine
      // callback) can't both pass the check above and both credit the
      // balance back — only the request that actually flips the status wins.
      const transition = await tx.leaveApplication.updateMany({
        where: { id, status: "Cancellation Requested" },
        data: approved
          ? { status: "Cancelled", cancelledOn: new Date() }
          : { status: "Approved", cancellationReason: null },
      });
      if (transition.count === 0) {
        return { finalized: false as const };
      }

      const updatedLeave = await tx.leaveApplication.findUniqueOrThrow({
        where: { id },
      });

      if (approved && tenantId) {
        if (isCompOffLeaveType(leave.leaveType, leavePolicies)) {
          await restoreCompOffCredits(leave.id, tx);
        } else {
          await adjustBalance(
            tenantId,
            leave.userId,
            leave.leaveType,
            leave.days,
            tx,
          );
        }
      }

      return { finalized: true as const, updatedLeave };
    });

    if (!result.finalized) {
      return callback(null, {
        message: MESSAGES.LEAVE_CANCELLED,
        status: status.OK,
      });
    }
    const { updatedLeave } = result;

    await cacheManager.invalidatePattern(
      `t:${getTenantId() ?? "global"}:leaves:*`,
    );

    const notificationMessage = approved
      ? "Your leave cancellation was approved."
      : "Your leave cancellation request was rejected — the leave remains approved.";

    Promise.all([
      prisma.user.findUnique({
        where: { id: updatedLeave.userId },
        select: { email: true },
      }),
      masterPrisma.tenant.findUnique({
        where: { id: getTenantId()! },
        select: { name: true, helpEmail: true },
      }),
    ])
      .then(([employee, tenant]) => {
        const tenantName = tenant?.name ?? "your organisation";
        const dateRange = formatDateOrRange(updatedLeave.from, updatedLeave.to);
        return notify({
          tenantId: getTenantId()!,
          event: approved ? "leaveCancelled" : "leaveCancellationRejected",
          targetUser: updatedLeave.userId,
          inApp: {
            title: "Leave",
            message: notificationMessage,
            eventType: "leave_notification",
            priority: "medium",
          },
          email: employee?.email
            ? {
                to: employee.email,
                subject: approved
                  ? "Your leave cancellation was approved"
                  : "Your leave cancellation request was rejected",
                html: renderEmailHtml({
                  title: approved
                    ? "Leave Cancellation Approved"
                    : "Leave Cancellation Rejected",
                  tenantName,
                  bodyHtml: `<h2>Hello,</h2><p>${notificationMessage}</p><p><strong>Dates:</strong> ${dateRange}</p>`,
                }),
                from: tenantFrom(tenantName),
                replyTo: tenantReplyTo(tenant?.helpEmail),
              }
            : undefined,
        });
      })
      .catch((err) =>
        logger.warn("[finalizeLeaveCancellation] notify failed:", { err }),
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
