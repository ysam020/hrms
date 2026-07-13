import { Response, NextFunction } from "express";
import { getClientForDb } from "@hrms/db";
import { logger } from "@hrms/logger";
import { AuthRequest } from "./authenticate";

// This middleware now covers ONLY security/identity events that aren't a
// mutation on a specific business record — logout and WebAuthn credential
// management. Every actual data mutation (leave, attendance, payroll, KYC,
// permissions, etc. — anything going through Prisma) is captured with a
// real before/after diff by the audit middleware attached to each tenant's
// PrismaClient instead (see packages/database/src/auditMiddleware.ts),
// which is far more accurate than guessing an entity type from a URL path.
//
// Deliberately excluded: /refresh-token and the pre-login parts of the
// WebAuthn/Google flow (options/verify-login/redirect). None of those run
// through `authenticate`, so there's no resolved tenant to attribute or
// write the entry into, and a token refresh isn't a meaningful user action
// worth an accountability-trail entry regardless.
const AUTH_PATHS =
  /\/(webauthn-register|webauthn-credential|disable-webauthn|logout)/i;

function sanitizeAction(path: string): string {
  if (/logout/i.test(path)) return "Logged out";
  if (/disable-webauthn/i.test(path)) return "Removed a security key";
  if (/webauthn-register/i.test(path)) return "Registered a security key";
  return "Account security action";
}

export function auditLogMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!AUTH_PATHS.test(req.path)) return next();

  res.on("finish", () => {
    // Read req.user here, inside the callback, not before next() above.
    // This middleware is mounted ahead of `authenticate` in the app's
    // middleware chain (see server.ts), so req.user is NOT populated yet at
    // the top of this function — it's only set once `authenticate` runs
    // later in the chain. By the time 'finish' fires the request has fully
    // completed, so req.user (mutated in place onto the same req object) is
    // reliably available here.
    const tenantId = req.user?.tenantId || null;
    const dbName = req.user?.dbName || null;
    if (!tenantId || !dbName) return; // pre-login / unauthenticated — nowhere to attribute this

    const isFailure = res.statusCode >= 400;
    if (res.statusCode < 200 || (res.statusCode >= 300 && !isFailure)) return;

    const userId = req.user?.userId || null;
    const ipAddress = req.ip || req.socket.remoteAddress || "";

    // Write directly to this request's tenant database via the pooled client
    // rather than through the AsyncLocalStorage-backed `prismaWithTenant`
    // proxy: by the time 'finish' fires, the tenant context that `authenticate`
    // establishes with runWithTenant() has already unwound, so a
    // getTenantClient() lookup here would silently miss and fall back to the
    // master database instead of this tenant's own.
    const tenantClient = getClientForDb(dbName);

    tenantClient.auditLog
      .create({
        data: {
          tenantId,
          userId,
          action: "AUTH",
          entityType: "auth",
          description: `${sanitizeAction(req.path)}${isFailure ? " (failed)" : ""}`,
          ipAddress,
          userAgent: req.headers["user-agent"] || "",
        },
      })
      .catch((err: any) => logger.error("Failed to write audit log:", { err }));
  });

  next();
}
