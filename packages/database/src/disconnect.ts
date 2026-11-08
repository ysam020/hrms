import { prisma } from "./prismaClient";
import { closeAllTenantClients } from "./tenantClientPool";

/**
 * Closes every database client this process holds: the tenant pool
 * (including clients still in their eviction grace period) and the master
 * client. For shutdown, after work using them has drained.
 */
export async function disconnectDatabases(): Promise<void> {
  await Promise.all([closeAllTenantClients(), prisma.$disconnect()]);
}
