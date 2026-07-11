import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { cancelApproval } from "@hrms/approval-engine";
import { MESSAGES } from "../constants/messages";

/**
 * Employee-initiated withdrawal, before HR has made a decision. Distinct from
 * rejectResignation — previously the gateway called RejectResignation with a
 * "Withdrawn" status that handler silently ignored (it hardcodes "Rejected"),
 * so withdrawals were incorrectly recorded as rejections. This is the real fix.
 */
export const withdrawResignation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, userId } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const tenantId = getTenantId();

    // findFirst (not findUnique) so tenantId is enforced — tenants without a
    // dedicated DB share the master DB, where `id` alone doesn't prevent
    // acting on another tenant's resignation.
    const resignation = await prisma.resignation.findFirst({
      where: { id, tenantId },
    });
    if (!resignation) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    // `userId` is the acting employee's own id for self-service withdrawals.
    // The gateway (recruitment.ts withdrawResignation) omits it entirely when
    // the caller is a privileged owner/admin/superuser withdrawing on an
    // employee's behalf — that's the intentional override, not a bypass.
    if (userId && resignation.userId !== userId) {
      return callback(null, {
        message: MESSAGES.CANNOT_WITHDRAW_OTHERS_RESIGNATION,
        status: status.PERMISSION_DENIED,
      });
    }

    if (resignation.status !== "Submitted") {
      return callback(null, {
        message: MESSAGES.ONLY_SUBMITTED_CAN_BE_WITHDRAWN,
        status: status.FAILED_PRECONDITION,
      });
    }

    await prisma.resignation.update({
      where: { id },
      data: {
        status: "Withdrawn",
        withdrawnOn: new Date(),
        lastUpdatedOn: new Date(),
      },
    });

    // Cancels the submit-time ApprovalInstance (see submitResignation.ts) so
    // it stops showing up as a pending approval for a withdrawn resignation.
    if (tenantId) {
      const instance = await (prisma as any).approvalInstance.findFirst({
        where: {
          tenantId,
          module: "resignation",
          entityId: id,
          status: "pending",
        },
      });
      if (instance) {
        await cancelApproval(instance.id).catch((err) =>
          logger.warn(
            "[withdrawResignation] Failed to cancel pending approval instance:",
            { err },
          ),
        );
      }
    }

    await cacheManager.invalidatePattern(`t:${tenantId}:resignations:*`);

    // WithdrawResignation's proto response is BasicResponse (message+status
    // only, no `data` field) — a `data` value here would just be silently
    // dropped by the encoder, so don't bother constructing one.
    return callback(null, {
      message: MESSAGES.RESIGNATION_WITHDRAWN,
      status: status.OK,
    });
  } catch (err) {
    logger.error("WithdrawResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
