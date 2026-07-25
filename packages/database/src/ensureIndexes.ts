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
}
