import { Request, Response } from "express";
import { performanceReviewClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { isSuperUser } from "../utils/user";

// Owner/admin/hr (tenantRole) and superusers manage review cycles by default;
// PerformanceReview:manage_cycles lets a tenant grant that access to anyone
// else without handing out a full HR role — mirrors canManageSalary in
// handlers/salary.ts.
async function canManageReviews(
  userId: string,
  tenantRole: string | null | undefined,
): Promise<boolean> {
  if (["owner", "admin", "hr"].includes(tenantRole ?? "")) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true, permissions: true },
  });
  if (user?.isSuperUser) return true;
  return (user?.permissions ?? []).includes("PerformanceReview:manage_cycles");
}

export async function createCycle(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const allowed = await canManageReviews(user!.userId, user!.tenantRole);
    if (!allowed) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message:
          "Only HR, admin, or owner can create performance review cycles",
      });
    }

    const { name, periodStart, periodEnd, ratingScale, userIds } = req.body;
    const response = await grpcCall(performanceReviewClient, "createCycle", {
      name,
      periodStart,
      periodEnd,
      ratingScale,
      userIds,
    });

    return apiResponse(res, RESPONSE_STATUS.CREATED, response);
  } catch (error) {
    logger.error("createCycle error:", { error });
    return handleError(res, error);
  }
}

export async function listCycles(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const privileged = await canManageReviews(user!.userId, user!.tenantRole);
    const response = await grpcCall(performanceReviewClient, "listCycles", {
      // Non-privileged callers only get cycles they're enrolled in — see
      // listCycles.ts (performance-review-service) for the enforcement.
      requesterId: privileged ? "" : user!.userId,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error) {
    logger.error("listCycles error:", { error });
    return handleError(res, error);
  }
}

export async function updateCycle(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const allowed = await canManageReviews(user!.userId, user!.tenantRole);
    if (!allowed) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Only HR, admin, or owner can edit performance review cycles",
      });
    }

    const { name, periodStart, periodEnd, ratingScale, userIds } = req.body;
    const response = await grpcCall(performanceReviewClient, "updateCycle", {
      id: req.params.cycleId,
      name,
      periodStart,
      periodEnd,
      ratingScale,
      userIds,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error) {
    logger.error("updateCycle error:", { error });
    return handleError(res, error);
  }
}

export async function updateCycleStatus(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const allowed = await canManageReviews(user!.userId, user!.tenantRole);
    if (!allowed) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Only HR, admin, or owner can change a review cycle's status",
      });
    }

    const { status: targetStatus } = req.body;
    const response = await grpcCall(
      performanceReviewClient,
      "updateCycleStatus",
      { id: req.params.cycleId, status: targetStatus },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error) {
    logger.error("updateCycleStatus error:", { error });
    return handleError(res, error);
  }
}

export async function getCycle(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const privileged = await canManageReviews(user!.userId, user!.tenantRole);
    const response = await grpcCall(performanceReviewClient, "getCycle", {
      id: req.params.cycleId,
      // Non-privileged callers may only view a cycle they're enrolled in —
      // see getCycle.ts (performance-review-service) for the enforcement.
      requesterId: privileged ? "" : user!.userId,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error) {
    logger.error("getCycle error:", { error });
    return handleError(res, error);
  }
}

// GET /performance-reviews?cycleId=&userId=&reviewerId=
// Frontend passes userId=self for "My Reviews" and reviewerId=self for
// "Team Reviews" — non-privileged callers may only ever query their own id
// in either slot, never an arbitrary employee's.
export async function listReviews(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const privileged = await canManageReviews(user!.userId, user!.tenantRole);
    const { cycleId, userId, reviewerId } = req.query as Record<string, string>;

    if (!privileged) {
      // A bare call (no filters at all) or a bare cycleId (no userId/
      // reviewerId scoping) would otherwise list every employee's review —
      // only HR/admin/owner may browse unscoped or by cycle; everyone else
      // must scope to their own id.
      if (!userId && !reviewerId) {
        return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
          message: "Forbidden",
        });
      }
      if (userId && userId !== user!.userId) {
        return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
          message: "Forbidden",
        });
      }
      if (reviewerId && reviewerId !== user!.userId) {
        return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
          message: "Forbidden",
        });
      }
    }

    const response = await grpcCall(performanceReviewClient, "listReviews", {
      cycleId,
      userId,
      reviewerId,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error) {
    logger.error("listReviews error:", { error });
    return handleError(res, error);
  }
}

export async function getReview(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response: any = await grpcCall(performanceReviewClient, "getReview", {
      id: req.params.reviewId,
    });

    const privileged = await isSuperUser(user!.userId);
    const review = response?.data;
    if (
      !privileged &&
      review &&
      review.userId !== user!.userId &&
      review.reviewerId !== user!.userId
    ) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error) {
    logger.error("getReview error:", { error });
    return handleError(res, error);
  }
}

export async function submitSelfAssessment(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const existing: any = await grpcCall(performanceReviewClient, "getReview", {
      id: req.params.reviewId,
    });
    if (existing?.data && existing.data.userId !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You can only submit a self-assessment for your own review",
      });
    }

    const { selfComments, selfRating } = req.body;
    const response = await grpcCall(
      performanceReviewClient,
      "submitSelfAssessment",
      { reviewId: req.params.reviewId, selfComments, selfRating },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error) {
    logger.error("submitSelfAssessment error:", { error });
    return handleError(res, error);
  }
}

export async function submitManagerReview(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const existing: any = await grpcCall(performanceReviewClient, "getReview", {
      id: req.params.reviewId,
    });
    const privileged = await canManageReviews(user!.userId, user!.tenantRole);
    if (
      !privileged &&
      existing?.data &&
      existing.data.reviewerId !== user!.userId
    ) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Only the assigned reviewer can submit this manager review",
      });
    }

    const {
      managerComments,
      managerRating,
      overallRating,
      recommendedIncrementPct,
      effectiveFrom,
    } = req.body;
    const response = await grpcCall(
      performanceReviewClient,
      "submitManagerReview",
      {
        reviewId: req.params.reviewId,
        managerComments,
        managerRating,
        overallRating,
        recommendedIncrementPct,
        effectiveFrom,
      },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error) {
    logger.error("submitManagerReview error:", { error });
    return handleError(res, error);
  }
}
