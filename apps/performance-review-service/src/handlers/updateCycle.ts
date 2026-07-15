import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewCycleProto } from "./serializers";
import { resolveReviewerId } from "./resolveReviewer";

export const updateCycle = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, name, periodStart, periodEnd, ratingScale, userIds } =
      call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.CYCLE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const tenantId = getTenantId()!;

    const existing = await prisma.performanceReviewCycle.findUnique({
      where: { id },
    });
    if (!existing || existing.status === "deleted") {
      return callback(null, {
        message: MESSAGES.CYCLE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const cycle = await prisma.performanceReviewCycle.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(periodStart ? { periodStart: new Date(periodStart) } : {}),
        ...(periodEnd ? { periodEnd: new Date(periodEnd) } : {}),
        ...(ratingScale ? { ratingScale } : {}),
      },
    });

    const existingReviews = await prisma.performanceReview.findMany({
      where: { tenantId, cycleId: id },
    });

    // Self-heal: a review whose employee wasn't on any Team when the cycle
    // was created (or edited before this fallback existed) is stuck with
    // reviewerId unset and invisible to everyone's "Team Reviews" list.
    // Re-resolve it on every edit so fixing the underlying Team membership
    // (or just re-saving the cycle) unblocks it without a dedicated
    // "reassign reviewer" UI.
    for (const r of existingReviews) {
      if (r.reviewerId) continue;
      const reviewerId = await resolveReviewerId(
        tenantId,
        r.userId,
        existing.createdBy,
      );
      if (reviewerId) {
        await prisma.performanceReview.update({
          where: { id: r.id },
          data: { reviewerId },
        });
      }
    }

    // Membership diff — only runs when the caller actually sent a userIds
    // list (an omitted/undefined field leaves membership untouched).
    if (Array.isArray(userIds)) {
      const existingUserIds = new Set(existingReviews.map((r) => r.userId));
      const desiredUserIds = new Set<string>(userIds);

      const toAdd = userIds.filter((u: string) => !existingUserIds.has(u));
      // Only drop reviews that never progressed past draft — anything with
      // a submitted self-assessment/manager review is preserved even if the
      // employee is unchecked from the cycle, so in-progress work is never
      // silently discarded by an edit.
      const toRemove = existingReviews.filter(
        (r) => !desiredUserIds.has(r.userId) && r.status === "draft",
      );

      for (const userId of toAdd) {
        try {
          const reviewerId = await resolveReviewerId(
            tenantId,
            userId,
            existing.createdBy,
          );
          await prisma.performanceReview.create({
            data: {
              tenantId,
              cycleId: id,
              userId,
              reviewerId,
              status: "draft",
            },
          });
        } catch (err) {
          logger.error("UpdateCycle: failed to add review for user", {
            cycleId: id,
            userId,
            err,
          });
        }
      }

      if (toRemove.length > 0) {
        await prisma.performanceReview.deleteMany({
          where: { id: { in: toRemove.map((r) => r.id) } },
        });
      }
    }

    return callback(null, {
      message: MESSAGES.CYCLE_UPDATED,
      status: status.OK,
      data: toPerformanceReviewCycleProto(cycle),
    });
  } catch (err) {
    logger.error("UpdateCycle error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
