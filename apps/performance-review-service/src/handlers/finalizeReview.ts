import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewProto } from "./serializers";

// Called by api-gateway's MODULE_SIDE_EFFECTS["performance_review"] once the
// approval-engine instance for this review reaches a final decision. The
// gateway (the only cross-service orchestrator in this codebase) has already
// created the new SalaryStructure via salary-service when applicable, and
// passes its id through here so it's stored on the review.
export const finalizeReview = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, approved, salaryStructureId } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.REVIEW_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.performanceReview.findUnique({
      where: { id },
    });
    if (!existing) {
      return callback(null, {
        message: MESSAGES.REVIEW_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const updated = await prisma.performanceReview.update({
      where: { id },
      data: {
        status: approved ? "approved" : "rejected",
        salaryStructureId: salaryStructureId || null,
        finalizedAt: new Date(),
      },
    });

    return callback(null, {
      message: MESSAGES.REVIEW_FINALIZED,
      status: status.OK,
      data: toPerformanceReviewProto(updated),
    });
  } catch (err) {
    logger.error("FinalizeReview error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
