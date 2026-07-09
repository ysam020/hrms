import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { cancelApproval } from "@hrms/approval-engine";
import { MESSAGES } from "../constants/messages";
import { toResignationProto } from "./resignationSerializer";

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

    const resignation = await prisma.resignation.findUnique({ where: { id } });
    if (!resignation) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

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

    const updatedResignation = await prisma.resignation.update({
      where: { id },
      data: {
        status: "Withdrawn",
        withdrawnOn: new Date(),
        lastUpdatedOn: new Date(),
      },
    });

    // Cancels the submit-time ApprovalInstance (see submitResignation.ts) so
    // it stops showing up as a pending approval for a withdrawn resignation.
    const tenantId = getTenantId();
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

    return callback(null, {
      message: MESSAGES.RESIGNATION_WITHDRAWN,
      status: status.OK,
      data: toResignationProto(updatedResignation),
    });
  } catch (err) {
    logger.error("WithdrawResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
