import { Response, NextFunction } from "express";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { AuthRequest } from "./authenticate";
import { hasSupportAccess } from "../services/supportStore";

/**
 * Praesto support team only: the request must come from Praesto's own
 * organisation (PLATFORM_TENANT_ID) by its owner/admin, a superuser, or a
 * holder of PraestoSupport:handle_tickets. Being an owner, admin or
 * superuser of any other organisation grants nothing. Checked live on every
 * request, so removing the permission takes effect immediately.
 */
export async function requireSupportAgent(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
      message: "Unauthorized",
    });
    return;
  }
  try {
    if (!(await hasSupportAccess(req.user))) {
      apiResponse(res, RESPONSE_STATUS.FORBIDDEN, { message: "Forbidden" });
      return;
    }
    next();
  } catch {
    apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}
