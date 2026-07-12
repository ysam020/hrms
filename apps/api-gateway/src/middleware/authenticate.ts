import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma, runWithTenant, getClientForDb } from "@hrms/db";
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

// In-memory cache: tenantId → dbName (avoids a DB lookup on every request for old tokens)
const dbNameCache = new Map<string, string>();

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
      resolveDbName(tid, dbNameFromToken)
        .then((dbName) => {
          const tenantClient = dbName ? getClientForDb(dbName) : null;
          // Run the handler chain inside BOTH storage contexts:
          // - gatewayTenantStorage → read by grpcCall to forward metadata to gRPC services
          // - runWithTenant (DB package) → read by prismaWithTenant for direct DB calls
          gatewayTenantStorage.run({ tenantId: tid, dbName }, () => {
            runWithTenant(tid, tenantClient, next);
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
  if (["owner", "admin"].includes(req.user.tenantRole ?? "")) {
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
  if (["owner", "admin", "hr"].includes(req.user.tenantRole ?? "")) {
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
