import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { instantiateApproval } from "@hrms/approval-engine";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewProto } from "./serializers";

export const submitManagerReview = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      reviewId,
      managerComments,
      managerRating,
      overallRating,
      recommendedIncrementPct,
      effectiveFrom,
    } = call.request;

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
        managerComments,
        managerRating: parseFloat(managerRating) || 0,
        overallRating: parseFloat(overallRating) || 0,
        recommendedIncrementPct: recommendedIncrementPct
          ? parseFloat(recommendedIncrementPct)
          : null,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
        status: "manager_review_submitted",
        managerSubmittedAt: new Date(),
      },
    });

    // Hands off to the shared polymorphic approval engine — the same one
    // leave/resignation/wfh/salary_advance/overtime use. A tenant with no
    // configured "performance_review" chain gets a single-step default
    // resolved to the employee's reporting manager; tenants that want a
    // separate HR sign-off before the comp change lands should configure a
    // chain for this module (see Approval Chains admin screen).
    const tenantId = getTenantId();
    if (tenantId) {
      await instantiateApproval(
        tenantId,
        "performance_review",
        updated.id,
        updated.userId,
        {
          overallRating: updated.overallRating,
          recommendedIncrementPct: updated.recommendedIncrementPct,
        },
      );
    }

    return callback(null, {
      message: MESSAGES.MANAGER_REVIEW_SUBMITTED,
      status: status.OK,
      data: toPerformanceReviewProto(updated),
    });
  } catch (err) {
    logger.error("SubmitManagerReview error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
