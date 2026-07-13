import { AsyncLocalStorage } from "async_hooks";
import { PrismaClient } from "@prisma/client";

// Who is making the current request — carried alongside the tenant/DB
// context so the audit-logging Prisma middleware (auditMiddleware.ts) can
// attribute a mutation to a person without threading it through every
// handler's call signature.
export interface AuditActor {
  userId: string | null;
  username: string | null;
  ipAddress: string;
  userAgent: string;
}

interface TenantContext {
  tenantId: string;
  tenantClient: PrismaClient | null;
  actor?: AuditActor;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

export function getTenantClient(): PrismaClient | null | undefined {
  return tenantStorage.getStore()?.tenantClient;
}

export function getAuditActor(): AuditActor | undefined {
  return tenantStorage.getStore()?.actor;
}

export function runWithTenant<T>(
  tenantId: string,
  tenantClient: PrismaClient | null,
  fn: () => T,
  actor?: AuditActor,
): T {
  return tenantStorage.run({ tenantId, tenantClient, actor }, fn);
}
