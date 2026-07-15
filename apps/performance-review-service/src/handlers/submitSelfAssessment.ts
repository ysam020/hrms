import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewProto } from "./serializers";

export const submitSelfAssessment = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { reviewId, selfComments, selfRating } = call.request;

    if (!reviewId) {
      return callback(null, {
        message: MESSAGES.REVIEW_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.performanceReview.findUnique({
      where: { id: reviewId },
    });
    if (!existing) {
      return callback(null, {
        message: MESSAGES.REVIEW_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const updated = await prisma.performanceReview.update({
      where: { id: reviewId },
      data: {
        selfComments,
        selfRating: parseFloat(selfRating) || 0,
        status: "self_assessment_submitted",
        submittedAt: new Date(),
      },
    });

    return callback(null, {
      message: MESSAGES.SELF_ASSESSMENT_SUBMITTED,
      status: status.OK,
      data: toPerformanceReviewProto(updated),
    });
  } catch (err) {
    logger.error("SubmitSelfAssessment error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
