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
    const {
      cycleId,
      userId,
      reviewerId,
      search,
      status: statusFilter,
    } = call.request as Record<string, string>;
    const tenantId = getTenantId()!;

    const where: any = { tenantId };
    if (cycleId) where.cycleId = cycleId;
    if (userId) where.userId = userId;
    if (reviewerId) where.reviewerId = reviewerId;
    if (statusFilter && statusFilter.toLowerCase() !== "all") {
      where.status = statusFilter;
    }

    if (search) {
      // Reviews only store bare userId/cycleId — resolve the search term
      // against the shared User/PerformanceReviewCycle tables (same DB,
      // same Prisma client) rather than requiring a cross-service call.
      const [matchingUsers, matchingCycles] = await Promise.all([
        prisma.user.findMany({
          where: {
            tenantId,
            OR: [
              { first_name: { contains: search, mode: "insensitive" } },
              { last_name: { contains: search, mode: "insensitive" } },
              { username: { contains: search, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        }),
        prisma.performanceReviewCycle.findMany({
          where: { tenantId, name: { contains: search, mode: "insensitive" } },
          select: { id: true },
        }),
      ]);

      where.OR = [
        { userId: { in: matchingUsers.map((u) => u.id) } },
        { cycleId: { in: matchingCycles.map((c) => c.id) } },
      ];
    }

    // No pagination UI on this list yet (it merges a "my reviews" and "team
    // reviews" call client-side) — only truncate when a positive limit is
    // explicitly passed, so existing callers keep getting the full,
    // filtered result set.
    const limit = parseInt(String(call.request?.limit)) || 0;
    const page = parseInt(String(call.request?.page)) || 1;
    const skip = limit > 0 ? (page - 1) * limit : undefined;

    const [reviews, total] = await Promise.all([
      prisma.performanceReview.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...(limit > 0 ? { skip, take: limit } : {}),
      }),
      prisma.performanceReview.count({ where }),
    ]);

    return callback(null, {
      message: MESSAGES.REVIEWS_FETCHED,
      status: status.OK,
      data: reviews.map(toPerformanceReviewProto),
      total,
    });
  } catch (err) {
    logger.error("ListReviews error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  }
};
