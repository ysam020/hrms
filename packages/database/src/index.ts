// prisma lives in its own leaf module (prismaClient.ts) with no dependency
// on this file, specifically so prismaWithTenant.ts can import it directly
// instead of importing it back from here — index.ts re-exporting
// prismaWithTenant while prismaWithTenant imported `prisma` from index.ts
// created a circular import that (depending on the runtime/bundler's
// circular-resolution order) can throw "Cannot access 'prisma' before
// initialization" — reproducible by running any script directly against
// this package's TypeScript source via tsx (e.g. `tsx src/seed.ts`), since
// every other consumer only ever imports the already-compiled dist output.
export { prisma } from "./prismaClient";
export { PrismaClient } from "@prisma/client";
export * from "@prisma/client";
export {
  tenantStorage,
  getTenantId,
  getTenantClient,
  runWithTenant,
} from "./tenantContext";
export { prismaWithTenant } from "./prismaWithTenant";
export { getClientForDb, closeAllTenantClients } from "./tenantClientPool";
export { canonicalizeEmail } from "./email";
