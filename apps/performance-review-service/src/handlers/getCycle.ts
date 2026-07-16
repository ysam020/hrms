import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewCycleProto } from "./serializers";

export const getCycle = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, requesterId } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.CYCLE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const cycle = await prisma.performanceReviewCycle.findUnique({
      where: { id },
    });

    if (!cycle) {
      return callback(null, {
        message: MESSAGES.CYCLE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    // Set by the gateway only for non-privileged callers — they may only
    // view a cycle they're actually enrolled in (as reviewee or reviewer).
    if (requesterId) {
      const enrolled = await prisma.performanceReview.findFirst({
        where: {
          cycleId: id,
          OR: [{ userId: requesterId }, { reviewerId: requesterId }],
        },
        select: { id: true },
      });
      if (!enrolled) {
        return callback(null, {
          message: MESSAGES.FORBIDDEN,
          status: status.PERMISSION_DENIED,
        });
      }
    }

    return callback(null, {
      message: MESSAGES.CYCLE_FETCHED,
      status: status.OK,
      data: toPerformanceReviewCycleProto(cycle),
    });
  } catch (err) {
    logger.error("GetCycle error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
