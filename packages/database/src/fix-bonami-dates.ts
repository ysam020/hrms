/**
 * Fix string-formatted DateTime fields in hrms-bonami-software and master DB users.
 *
 * Root cause: $runCommandRaw uses JSON.stringify, so new Date() becomes an ISO
 * string instead of a BSON Date. This script finds all such fields and converts
 * them to proper BSON Dates using the { $date: { $numberLong: "ms" } } EJSON format.
 *
 * Usage:
 *   DEV_MONGODB_URI="mongodb+srv://..." pnpm --filter=@hrms/db exec tsx src/fix-bonami-dates.ts
 */

import { PrismaClient } from "@prisma/client";

const BONAMI_TENANT_ID = "6a0bd765f9ff1bdc7c809931";
const BONAMI_DB = "hrms-bonami-software";

const masterPrisma = new PrismaClient({
  datasourceUrl: process.env.DEV_MONGODB_URI,
});

function buildUrl(dbName: string): string {
  const base = process.env.DEV_MONGODB_URI!;
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

const bonamiPrisma = new PrismaClient({ datasourceUrl: buildUrl(BONAMI_DB) });

const rm = (cmd: Record<string, unknown>): Promise<any> =>
  (masterPrisma.$runCommandRaw as any)(cmd);
const rb = (cmd: Record<string, unknown>): Promise<any> =>
  (bonamiPrisma.$runCommandRaw as any)(cmd);

function oid(id: string) {
  return { $oid: id };
}
function bsonDate(isoStr: string) {
  return { $date: { $numberLong: new Date(isoStr).getTime().toString() } };
}
function extractId(doc: any): any {
  return doc._id;
}

async function fixFields(
  run: (cmd: Record<string, unknown>) => Promise<any>,
  col: string,
  dateFields: string[],
  filter: object = {},
) {
  let totalFixed = 0;
  let lastId: any = null;

  while (true) {
    const f: any = lastId
      ? { $and: [filter, { _id: { $gt: lastId } }] }
      : filter;

    const res = await run({
      find: col,
      filter: f,
      sort: { _id: 1 },
      limit: 500,
    });
    const batch: any[] = res?.cursor?.firstBatch ?? [];
    if (batch.length === 0) break;

    for (const doc of batch) {
      const updates: Record<string, any> = {};
      for (const field of dateFields) {
        const val = doc[field];
        if (typeof val === "string" && val) {
          const ms = new Date(val).getTime();
          if (!isNaN(ms)) {
            updates[field] = bsonDate(val);
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        await run({
          update: col,
          updates: [
            { q: { _id: doc._id }, u: { $set: updates }, multi: false },
          ],
        });
        totalFixed++;
      }
    }

    lastId = batch[batch.length - 1]._id;
    // Break only when the batch is empty — MongoDB's firstBatch is capped at ~101
    // regardless of the limit parameter, so don't break on batch.length < limit.
  }

  return totalFixed;
}

async function main() {
  console.log("=== Fix String Dates ===\n");

  // ── Master DB: users (joining_date, kyc_date, createdAt, updatedAt) ────────
  console.log("── Master DB: users ──");
  const userFields = ["joining_date", "kyc_date", "createdAt", "updatedAt"];
  const usersFixed = await fixFields(rm, "users", userFields, {
    tenantId: oid(BONAMI_TENANT_ID),
  });
  console.log(`  users: ${usersFixed} docs fixed\n`);

  // ── hrms-bonami-software collections ──────────────────────────────────────
  console.log("── hrms-bonami-software ──");

  const collections: Array<{ col: string; fields: string[] }> = [
    {
      col: "attendance_records",
      fields: ["date", "timeIn", "timeOut"],
    },
    {
      col: "leaves",
      fields: ["from", "to", "appliedOn", "approvedOn"],
    },
    {
      col: "leavebalances",
      fields: ["createdAt", "updatedAt"],
    },
    {
      col: "salarystructures",
      fields: ["createdAt", "updatedAt"],
    },
    {
      col: "notifications",
      fields: ["timeStamp"],
    },
    {
      col: "hractivities",
      fields: ["scheduledAt", "createdOn", "lastUpdatedOn", "deletedOn"],
    },
    {
      col: "policies",
      fields: ["createdOn", "lastUpdatedOn", "deletedOn"],
    },
    {
      col: "rules",
      fields: [
        "effectiveFrom",
        "effectiveTo",
        "createdAt",
        "updatedAt",
        "lastExecuted",
      ],
    },
    {
      col: "jobopenings",
      fields: [
        "jobPostingDate",
        "applicationDeadline",
        "createdOn",
        "lastUpdatedOn",
        "deletedOn",
      ],
    },
    {
      col: "chatrooms",
      fields: ["lastActivity", "createdAt", "updatedAt"],
    },
    {
      col: "messages",
      fields: ["createdAt", "updatedAt"],
    },
    {
      col: "auditlogs",
      fields: ["timestamp"],
    },
    {
      col: "resignations",
      fields: [
        "resignationDate",
        "lastWorkingDay",
        "submittedOn",
        "approvedOn",
        "rejectedOn",
        "withdrawnOn",
        "feedbackSubmittedOn",
        "lastUpdatedOn",
      ],
    },
    {
      col: "hractivities",
      fields: ["scheduledAt", "createdOn", "lastUpdatedOn"],
    },
  ];

  // Deduplicate collections
  const seen = new Set<string>();
  for (const { col, fields } of collections) {
    if (seen.has(col)) continue;
    seen.add(col);
    const n = await fixFields(rb, col, fields);
    console.log(`  ${col}: ${n} docs fixed`);
  }

  console.log("\n✓ Date fix complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await masterPrisma.$disconnect();
    await bonamiPrisma.$disconnect();
  });
