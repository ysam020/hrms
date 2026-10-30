import { prisma } from "./prismaClient";
import { logger } from "@hrms/logger";

// razorpaySubscriptionId can't be declared @unique in schema.prisma: Prisma's
// MongoDB connector doesn't emit sparse:true for optional @unique fields
// (prisma/prisma#12827), so a plain unique index throws E11000 on the second
// tenant ever created before payment (razorpaySubscriptionId left null) —
// the same landmine already documented on Tenant.domain. A partial unique
// index created directly against the driver sidesteps the bug: MongoDB only
// enforces uniqueness where the field exists, and Prisma still translates
// the resulting E11000 into a normal P2002 on tenant.create(), so
// application code doesn't need to know this index lives outside the schema.
//
// createIndexes is idempotent — safe to call on every boot.
export async function ensureMasterIndexes(): Promise<void> {
  try {
    await prisma.$runCommandRaw({
      createIndexes: "tenants",
      indexes: [
        {
          key: { razorpaySubscriptionId: 1 },
          name: "razorpaySubscriptionId_unique_partial",
          unique: true,
          partialFilterExpression: {
            razorpaySubscriptionId: { $exists: true, $type: "string" },
          },
        },
      ],
    });
  } catch (error: unknown) {
    logger.error("ensureMasterIndexes: failed to create tenant indexes", {
      error,
    });
  }

  // TrialClaim.key's unique index is what makes trial eligibility race-safe
  // (services/trial.ts in the gateway), so it can't depend on someone having
  // run `prisma db push` against the master DB.
  try {
    await prisma.$runCommandRaw({
      createIndexes: "trial_claims",
      indexes: [{ key: { key: 1 }, name: "TrialClaim_key_key", unique: true }],
    });
  } catch (error: unknown) {
    logger.error("ensureMasterIndexes: failed to create trial-claim index", {
      error,
    });
  }

  // The MCP collections' schema indexes, for deployments that never run
  // `prisma db push` against the master DB. Bearer-token and refresh-token
  // lookups hit these on every MCP call.
  try {
    await prisma.$runCommandRaw({
      createIndexes: "mcp_oauth_clients",
      indexes: [
        {
          key: { clientId: 1 },
          name: "McpOAuthClient_clientId_key",
          unique: true,
        },
      ],
    });
    await prisma.$runCommandRaw({
      createIndexes: "mcp_grants",
      indexes: [
        {
          key: { userId: 1, tenantId: 1 },
          name: "McpGrant_userId_tenantId_idx",
        },
        { key: { refreshTokenHash: 1 }, name: "McpGrant_refreshTokenHash_idx" },
        {
          key: { prevRefreshTokenHash: 1 },
          name: "McpGrant_prevRefreshTokenHash_idx",
        },
      ],
    });
  } catch (error: unknown) {
    logger.error("ensureMasterIndexes: failed to create MCP indexes", {
      error,
    });
  }
}
