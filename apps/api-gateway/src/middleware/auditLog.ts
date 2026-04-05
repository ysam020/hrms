import { Response, NextFunction } from "express";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { AuthRequest } from "./authenticate";

const METHOD_TO_ACTION: Record<string, string> = {
  POST: "CREATE",
  PUT: "UPDATE",
  PATCH: "UPDATE",
  DELETE: "DELETE",
};

// Auth paths where failed attempts should also be logged (security-relevant)
const AUTH_PATHS = /\/(webauthn|auth\/google|logout|refresh-token)/i;

// Strip sensitive query parameters from a path before logging to avoid
// capturing PII (email addresses, search terms) in the audit trail.
const SENSITIVE_PARAM_RE =
  /([?&])(password|token|secret|key|apikey|search|email|q)=[^&]*/gi;

function sanitizePath(path: string): string {
  return path.replace(SENSITIVE_PARAM_RE, "$1$2=***");
}

function deriveEntityType(path: string): string {
  if (/\/leave/i.test(path)) return "leave";
  if (/\/attendance/i.test(path)) return "attendance";
  if (/\/resignation/i.test(path)) return "recruitment";
  if (/\/job-|\/apply-for-job|\/application-status/i.test(path))
    return "recruitment";
  if (/\/hr-activity|\/hrm/i.test(path)) return "hrActivity";
  if (/\/salary/i.test(path)) return "salary";
  if (/\/notification/i.test(path)) return "notification";
  if (/\/webauthn|\/auth\/google|\/logout|\/refresh-token/i.test(path))
    return "auth";
  if (/\/employee|\/kyc|\/user/i.test(path)) return "employee";
  if (/\/permission/i.test(path)) return "permission";
  if (/\/holiday/i.test(path)) return "general";
  if (/\/chat/i.test(path)) return "chat";
  return "general";
}

export function auditLogMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const action = METHOD_TO_ACTION[req.method.toUpperCase()];
  const isAuthPath = AUTH_PATHS.test(req.path);

  // Only intercept mutation methods, or GET on auth paths
  if (!action && !isAuthPath) return next();

  res.on("finish", () => {
    const isFailedAuth = isAuthPath && res.statusCode >= 400;
    const isSuccessfulMutation =
      action && res.statusCode >= 200 && res.statusCode < 300;

    if (!isSuccessfulMutation && !isFailedAuth) return;

    const userId = req.user?.userId || "anonymous";
    const entityType = deriveEntityType(req.path);
    const description = `${action || "GET"} ${sanitizePath(req.originalUrl)} → ${res.statusCode}`;
    // Use req.ip which respects trust proxy setting, falling back to socket address
    const ipAddress = req.ip || req.socket.remoteAddress || "";

    prisma.auditLog
      .create({
        data: {
          userId,
          action: action || "AUTH",
          entityType,
          description,
          ipAddress,
          userAgent: req.headers["user-agent"] || "",
        },
      })
      .catch((err: any) => logger.error("Failed to write audit log:", { err }));
  });

  next();
}
