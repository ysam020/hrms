import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma, runWithTenant, getClientForDb, AuditActor } from "@hrms/db";
import { BoundedCache, hasPrivilegedRole, HR_ROLES } from "@hrms/common";
import { gatewayTenantStorage } from "./tenantContext";

export interface AuthUser {
  userId: string;
  tenantId: string | null;
  tenantRole: string | null;
  pendingSetup: boolean;
  orgSetupComplete?: boolean;
  dbName: string | null;
  // legacy fields still present in token for compatibility
  role?: string;
  email?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

// In-memory cache: tenantId → dbName (avoids a DB lookup on every request for
// old tokens). Bounded LRU + idle-TTL, same pattern as tenantClientPool.ts,
// so a long-running gateway process doesn't accumulate entries forever.
const dbNameCache = new BoundedCache<string, string>();

async function resolveDbName(
  tenantId: string,
  fromToken: string | null,
): Promise<string | null> {
  if (fromToken) return fromToken;
  if (dbNameCache.has(tenantId)) return dbNameCache.get(tenantId)!;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dbName: true },
  });
  if (tenant?.dbName) dbNameCache.set(tenantId, tenant.dbName);
  return tenant?.dbName ?? null;
}

// In-memory cache: userId → username, purely for labelling audit log rows —
// not security-sensitive, and (like dbNameCache above) tolerates serving a
// stale value for the rare case a user renames themselves mid-session.
const usernameCache = new BoundedCache<string, string | null>();

async function resolveUsername(userId: string): Promise<string | null> {
  if (usernameCache.has(userId)) return usernameCache.get(userId)!;
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { username: true } })
    .catch(() => null);
  const username = user?.username ?? null;
  usernameCache.set(userId, username);
  return username;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token =
    req.headers.authorization?.split(" ")[1] || req.cookies?.access_token;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const payload = jwt.verify(token, process.env.ACCESS_JWT_TOKEN!, {
      algorithms: ["HS256"],
    }) as any;
    req.user = payload;

    const tid = payload.tenantId ?? null;
    const dbNameFromToken: string | null = payload.dbName ?? null;

    if (tid) {
      // Resolve dbName (from JWT if present, else fall back to a DB lookup for old tokens)
      // and username (for audit-log attribution) in parallel.
      Promise.all([
        resolveDbName(tid, dbNameFromToken),
        resolveUsername(payload.userId),
      ])
        .then(([dbName, username]) => {
          const tenantClient = dbName ? getClientForDb(dbName) : null;
          const actor: AuditActor = {
            userId: payload.userId ?? null,
            username,
            ipAddress: req.ip || req.socket.remoteAddress || "",
            userAgent: req.headers["user-agent"] || "",
          };
          // Run the handler chain inside BOTH storage contexts:
          // - gatewayTenantStorage → read by grpcCall to forward tenant + actor as
          //   metadata to gRPC services, so a mutation performed by a downstream
          //   service (leave-service, hrm-service, etc.) can still be attributed
          // - runWithTenant (DB package) → read by prismaWithTenant for direct DB calls,
          //   and by the audit-logging Prisma middleware for who/where to attribute a change
          gatewayTenantStorage.run({ tenantId: tid, dbName, actor }, () => {
            runWithTenant(tid, tenantClient, next, actor);
          });
        })
        .catch(() => {
          res.status(500).json({ message: "Internal Server Error" });
        });
    } else {
      gatewayTenantStorage.run({ tenantId: null, dbName: null }, () => next());
    }
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Requires a fully resolved tenant context. Rejects pendingSetup tokens.
export const requireTenant = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  if (req.user.pendingSetup || !req.user.tenantId) {
    return res.status(403).json({
      message: "Please create or join an organisation first.",
      code: "PENDING_TENANT_SETUP",
    });
  }
  next();
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.tenantRole ?? "")) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
};

export const requireSuperUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  // Tenant owners have full privileges within their organisation
  if (req.user.tenantRole === "owner") {
    next();
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isSuperUser: true },
    });
    if (!user?.isSuperUser) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Like requireSuperUser, but also admits tenantRole "admin" (not just
 * "owner") — for routes where admins should have full visibility/control,
 * not just owners.
 */
export const requirePrivileged = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (hasPrivilegedRole(req.user.tenantRole ?? "")) {
    next();
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isSuperUser: true },
    });
    if (!user?.isSuperUser) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Billing actions on the current tenant's subscription: owners, admins,
 * superusers and `Subscription:*` permission holders — the same people the
 * web app shows the Subscription page to (hasSubscriptionAccess). A request
 * with no tenant yet (org setup, before the organisation exists) passes:
 * there's no subscription of anyone else's to act on.
 */
export const requireSubscriptionManager = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (!req.user.tenantId || hasPrivilegedRole(req.user.tenantRole ?? "")) {
    next();
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isSuperUser: true, permissions: true },
    });
    const permitted =
      user?.isSuperUser ||
      ((user?.permissions as string[] | undefined) ?? []).some((p) =>
        p.startsWith("Subscription:"),
      );
    if (!permitted) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Like requirePrivileged, but also admits tenantRole "hr" — for
 * management-visibility screens (Insights/analytics/reports) that HR staff
 * need for their job, not just owners/admins.
 */
export const requireHrPrivileged = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (hasPrivilegedRole(req.user.tenantRole ?? "", HR_ROLES)) {
    next();
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isSuperUser: true },
    });
    if (!user?.isSuperUser) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ message: "Internal Server Error" });
  }
};
