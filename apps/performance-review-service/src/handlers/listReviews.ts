import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewProto } from "./serializers";

export const listReviews = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { cycleId, userId, reviewerId } = call.request;

    const where: any = { tenantId: getTenantId()! };
    if (cycleId) where.cycleId = cycleId;
    if (userId) where.userId = userId;
    if (reviewerId) where.reviewerId = reviewerId;

    const reviews = await prisma.performanceReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return callback(null, {
      message: MESSAGES.REVIEWS_FETCHED,
      status: status.OK,
      data: reviews.map(toPerformanceReviewProto),
    });
  } catch (err) {
    logger.error("ListReviews error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
