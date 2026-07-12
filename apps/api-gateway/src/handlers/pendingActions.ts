import { Response } from "express";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { getPendingApprovalItems } from "./approvalChains";
import { getPendingKycItems } from "./employee";
import { getPendingJoinRequestItems } from "./tenant";

// GET /api/v1/approvals/pending-all — single aggregated source for every
// "Pending Approvals" surface (sidebar badge, dashboard widget, /approvals
// inbox). Replaces those three surfaces each independently calling
// GET /approvals/pending, GET /kyc-approvals/pending and
// GET /tenants/join-requests/pending on their own — which, hit from
// multiple places at once, collided with apiClient's same-URL GET
// deduplication (axiosConfig.ts cancels an in-flight request to the same
// URL when a new one starts), silently dropping one caller's count.
export async function listAllPendingActions(req: AuthRequest, res: Response) {
  try {
    const [chainItems, kycItems, joinRequestItems] = await Promise.all([
      getPendingApprovalItems(req).catch((error) => {
        logger.error("listAllPendingActions: chain approvals failed", {
          error,
        });
        return [];
      }),
      getPendingKycItems(req).catch((error) => {
        logger.error("listAllPendingActions: KYC items failed", { error });
        return [];
      }),
      getPendingJoinRequestItems(req).catch((error) => {
        logger.error("listAllPendingActions: join requests failed", {
          error,
        });
        return [];
      }),
    ]);

    const data = [...chainItems, ...kycItems, ...joinRequestItems].sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime(),
    );

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (error: unknown) {
    logger.error("listAllPendingActions error:", { error });
    return handleError(res, error);
  }
}
