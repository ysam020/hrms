import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewProto } from "./serializers";

export const getReview = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.REVIEW_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const review = await prisma.performanceReview.findUnique({
      where: { id },
    });

    if (!review) {
      return callback(null, {
        message: MESSAGES.REVIEW_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    return callback(null, {
      message: MESSAGES.REVIEW_FETCHED,
      status: status.OK,
      data: toPerformanceReviewProto(review),
    });
  } catch (err) {
    logger.error("GetReview error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
