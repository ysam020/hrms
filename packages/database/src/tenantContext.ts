import { AsyncLocalStorage } from "async_hooks";
import { PrismaClient } from "@prisma/client";
import { leaseClient } from "./clientLeases";

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
  if (!tenantClient) {
    return tenantStorage.run({ tenantId, tenantClient, actor }, fn);
  }
  // Holds the client for as long as `fn` runs — to completion of its
  // promise when it returns one — so pool eviction can't disconnect it
  // mid-operation. A caller whose work outlives `fn` (Express middleware
  // calling next()) holds its own lease (leaseClient) until it ends.
  const release = leaseClient(tenantClient);
  let result: T;
  try {
    result = tenantStorage.run({ tenantId, tenantClient, actor }, fn);
  } catch (err) {
    release();
    throw err;
  }
  if (result && typeof (result as any).then === "function") {
    (result as unknown as Promise<unknown>).then(release, release);
  } else {
    release();
  }
  return result;
}
