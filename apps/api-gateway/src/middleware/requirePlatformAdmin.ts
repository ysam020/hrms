import { Response, NextFunction } from "express";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { AuthRequest } from "./authenticate";
import {
  platformAdminGrants,
  type PlatformAdminAction,
} from "../services/platformAccess";

/**
 * Praesto Platform Console: the request must hold the given PraestoAdmin
 * action (see services/platformAccess.ts). Never derived from a request
 * parameter — only the signed token's tenant and the user's live record.
 * The grants are left on the request for handlers that vary by them.
 */
export function requirePlatformAdmin(action: PlatformAdminAction) {
  return async (
    req: AuthRequest & { platformGrants?: PlatformAdminAction[] },
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
        message: "Unauthorized",
      });
      return;
    }
    try {
      const grants = await platformAdminGrants(req.user);
      if (!grants.includes(action)) {
        apiResponse(res, RESPONSE_STATUS.FORBIDDEN, { message: "Forbidden" });
        return;
      }
      req.platformGrants = grants;
      next();
    } catch {
      apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
  };
}
