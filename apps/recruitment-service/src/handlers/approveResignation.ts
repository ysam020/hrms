import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import { toResignationProto } from "./resignationSerializer";

export const approveResignation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, lastWorkingDay, comments } = call.request;
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

    const resignation = await prisma.resignation.findUnique({ where: { id } });
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

    await cacheManager.invalidatePattern("resignations:*");

    // Notify employee (fire-and-forget)
    getNotificationQueue()
      .add("resignationApproved", {
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

    return callback(null, {
      message: MESSAGES.RESIGNATION_APPROVED,
      status: status.OK,
      data: toResignationProto(updatedResignation),
    });
  } catch (err) {
    logger.error("ApproveResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
