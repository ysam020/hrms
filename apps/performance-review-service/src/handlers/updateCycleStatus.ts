import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewCycleProto } from "./serializers";

const ALLOWED_STATUSES = new Set(["active", "closed", "deleted"]);

export const updateCycleStatus = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, status: targetStatus } = call.request;

    if (!id || !ALLOWED_STATUSES.has(targetStatus)) {
      return callback(null, {
        message: MESSAGES.CYCLE_STATUS_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.performanceReviewCycle.findUnique({
      where: { id },
    });
    if (!existing) {
      return callback(null, {
        message: MESSAGES.CYCLE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const cycle = await prisma.performanceReviewCycle.update({
      where: { id },
      data: { status: targetStatus },
    });

    return callback(null, {
      message: MESSAGES.CYCLE_STATUS_UPDATED,
      status: status.OK,
      data: toPerformanceReviewCycleProto(cycle),
    });
  } catch (err) {
    logger.error("UpdateCycleStatus error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
