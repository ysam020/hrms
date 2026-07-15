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
    const { id } = call.request;

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
