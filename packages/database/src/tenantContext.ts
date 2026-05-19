import { AsyncLocalStorage } from "async_hooks";
import { PrismaClient } from "@prisma/client";

interface TenantContext {
  tenantId: string;
  tenantClient: PrismaClient | null;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

export function getTenantClient(): PrismaClient | null | undefined {
  return tenantStorage.getStore()?.tenantClient;
}

export function runWithTenant<T>(
  tenantId: string,
  tenantClient: PrismaClient | null,
  fn: () => T,
): T {
  return tenantStorage.run({ tenantId, tenantClient }, fn);
}
