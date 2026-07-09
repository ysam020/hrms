import { prisma } from "./index";
import { getTenantId, getTenantClient } from "./tenantContext";

// READ operations that accept a `where` clause.
const READ_ACTIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

const WRITE_ACTIONS = new Set(["create", "createMany"]);

// Master-DB scoped client: auto-injects tenantId into User queries so that
// employee lookups in the shared users collection stay tenant-isolated.
const masterScopedPrisma = prisma.$extends({
  query: {
    user: {
      async $allOperations({ operation, args, query }: any) {
        const tenantId = getTenantId();
        if (tenantId) {
          if (READ_ACTIONS.has(operation)) {
            args = { ...args, where: { ...args.where, tenantId } };
          } else if (operation === "createMany") {
            args = {
              ...args,
              data: Array.isArray(args.data)
                ? args.data.map((d: any) => ({ ...d, tenantId }))
                : { ...args.data, tenantId },
            };
          } else if (WRITE_ACTIONS.has(operation)) {
            args = { ...args, data: { ...args.data, tenantId } };
          } else if (
            operation === "update" ||
            operation === "upsert" ||
            operation === "delete"
          ) {
            args = { ...args, where: { ...args.where, tenantId } };
          }
        }
        return query(args);
      },
    },
  },
});

// Models that live in the master DB.
// - user: tenant-scoped via the $extends filter above
// - tenant / tenantMembership / tenantInvite: cross-tenant admin data, no filter needed
const MASTER_MODELS = new Set([
  "user",
  "tenant",
  "tenantMembership",
  "tenantInvite",
]);

// Federated proxy:
//   prismaWithTenant.user.*           → master DB  (tenantId auto-injected by $extends)
//   prismaWithTenant.tenant.*         → master DB  (no filter — cross-tenant admin)
//   prismaWithTenant.<businessModel>  → tenant DB  (naturally isolated, no filter needed)
//
// Typed as `typeof prisma` so callers retain full Prisma type inference even
// though the runtime proxy routes to different PrismaClient instances.
export const prismaWithTenant = new Proxy({} as any, {
  get(_, prop: string) {
    // Prisma client-level methods ($transaction, $connect, $disconnect, etc.)
    if (prop.startsWith("$")) {
      const client = getTenantClient() ?? prisma;
      return (client as any)[prop].bind(client);
    }

    // User model → master DB with automatic tenantId injection
    if (prop === "user") {
      return (masterScopedPrisma as any).user;
    }

    // Cross-tenant admin models → plain master DB (no filter)
    if (MASTER_MODELS.has(prop)) {
      return (prisma as any)[prop];
    }

    // All business models → tenant-specific DB (isolated by database, no filter needed)
    const tenantClient = getTenantClient();
    return ((tenantClient ?? prisma) as any)[prop];
  },
}) as unknown as typeof prisma;

export type PrismaWithTenant = typeof prismaWithTenant;
