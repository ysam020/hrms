import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const approveResignation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    // `comments` isn't a real field on the UpdateStatusRequest proto — the
    // actual field is `remarks` (see UpdateStatusRequest in recruitment.proto).
    const { id, lastWorkingDay, remarks: comments } = call.request;
    const noticePeriodWaived: boolean | undefined =
      call.request.noticePeriodWaived;
    const buyoutAmount: number | undefined = call.request.buyoutAmount;
    const relievedFromDutyOn: string | undefined =
      call.request.relievedFromDutyOn;

    if (!id) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    // findFirst (not findUnique) so tenantId is enforced — tenants without a
    // dedicated DB share the master DB, where `id` alone doesn't prevent
    // acting on another tenant's resignation.
    const resignation = await prisma.resignation.findFirst({
      where: { id, tenantId: getTenantId() },
    });
    if (!resignation) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (resignation.status !== "Submitted") {
      return callback(null, {
        message: MESSAGES.ONLY_SUBMITTED_CAN_BE_APPROVED,
        status: status.FAILED_PRECONDITION,
      });
    }

    const updatedResignation = await prisma.resignation.update({
      where: { id },
      data: {
        status: "Approved",
        approvedOn: new Date(),
        // Only overwrite lastWorkingDay when HR explicitly counters it —
        // otherwise keep whatever was resolved at submission (notice-period
        // default, or the employee's own proposed date).
        ...(lastWorkingDay ? { lastWorkingDay: new Date(lastWorkingDay) } : {}),
        comments: comments || null,
        lastUpdatedOn: new Date(),
        ...(noticePeriodWaived !== undefined ? { noticePeriodWaived } : {}),
        ...(buyoutAmount !== undefined ? { buyoutAmount } : {}),
        ...(relievedFromDutyOn
          ? { relievedFromDutyOn: new Date(relievedFromDutyOn) }
          : {}),
      },
    });

    await cacheManager.invalidatePattern(`t:${getTenantId()}:resignations:*`);

    // Notify employee (fire-and-forget)
    getNotificationQueue()
      .add("resignationApproved", {
        tenantId: getTenantId()!,
        title: "Resignation",
        message: MESSAGES.RESIGNATION_APPROVED,
        targetUser: updatedResignation.userId,
        eventType: "resignation_notification",
        priority: "medium",
      })
      .catch((err) =>
        logger.error("[approveResignation] Notification enqueue failed:", {
          err,
        }),
      );

    // ApproveResignation's proto response is BasicResponse (message+status
    // only, no `data` field) — a `data` value here would just be silently
    // dropped by the encoder, so don't bother constructing one.
    return callback(null, {
      message: MESSAGES.RESIGNATION_APPROVED,
      status: status.OK,
    });
  } catch (err) {
    logger.error("ApproveResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
