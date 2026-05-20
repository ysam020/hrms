/**
 * One-time migration: switch from pool model (shared DB + tenantId filter)
 * to silo model (one database per tenant).
 *
 * What this script does:
 *   1. Backfills `dbName` on every tenant record (e.g. "hrms-acme-corp").
 *   2. Sets `isSuperUser: true` on all tenant owners in the master DB.
 *   3. For each tenant, copies all business-data collections from the master DB
 *      into the tenant's own database.
 *   4. (Optional, requires --cleanup flag) Deletes migrated business records
 *      from the master DB after verifying they exist in the tenant DB.
 *
 * Usage (from repo root):
 *   DEV_MONGODB_URI="mongodb+srv://..." pnpm --filter=@hrms/db exec tsx src/migrate-to-silo.ts
 *
 *   With cleanup (removes business data from master DB after migration):
 *   DEV_MONGODB_URI="mongodb+srv://..." pnpm --filter=@hrms/db exec tsx src/migrate-to-silo.ts --cleanup
 *
 * Safe to re-run — checks counts in tenant DB before copying.
 */

import { PrismaClient } from "@prisma/client";

const CLEANUP = process.argv.includes("--cleanup");

const masterPrisma = new PrismaClient({
  datasourceUrl: process.env.DEV_MONGODB_URI,
});

function buildUrl(dbName: string): string {
  const base = process.env.DEV_MONGODB_URI!;
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

function tenantPrisma(dbName: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: buildUrl(dbName) });
}

const run = (
  prisma: PrismaClient,
  cmd: Record<string, unknown>,
): Promise<any> => (prisma.$runCommandRaw as any)(cmd);

// _id-keyset pagination — avoids cursor expiry on Atlas.
// MongoDB returns ~101 docs per firstBatch regardless of `limit`, so we
// must loop until the batch is EMPTY, not until batch.length < PAGE.
async function findMany(
  prisma: PrismaClient,
  collection: string,
  filter: object,
): Promise<any[]> {
  const all: any[] = [];
  let lastId: string | null = null;
  while (true) {
    const f: any = lastId
      ? { $and: [filter, { _id: { $gt: { $oid: lastId } } }] }
      : filter;
    const res = await run(prisma, {
      find: collection,
      filter: f,
      sort: { _id: 1 },
      limit: 500,
    });
    const batch: any[] = res?.cursor?.firstBatch ?? [];
    if (batch.length === 0) break;
    all.push(...batch);
    const last = batch[batch.length - 1];
    lastId = last._id?.$oid ?? last._id?.toString?.() ?? String(last._id);
  }
  return all;
}

async function countDocs(
  prisma: PrismaClient,
  collection: string,
  filter: object = {},
): Promise<number> {
  const r = await run(prisma, { count: collection, query: filter });
  return r?.n ?? 0;
}

function extractId(doc: any): string {
  return doc._id?.$oid ?? doc._id?.toString?.() ?? String(doc._id);
}

function oid(id: string) {
  return { $oid: id };
}

// All business collections that move to per-tenant databases.
// Users and tenant-admin collections stay in master.
const BUSINESS_COLLECTIONS = [
  "attendance_records",
  "leaves",
  "leavebalances",
  "salarystructures",
  "notifications",
  "notification_recipients",
  "roles",
  "hractivities",
  "chatrooms",
  "messages",
  "auditlogs",
  "holidays",
  "policies",
  "rules",
  "teams",
  "jobopenings",
  "jobapplications",
  "resignations",
  "login_events",
];

async function main() {
  // ── 1. Fetch all tenants ──────────────────────────────────────────────────
  const tenants = await findMany(masterPrisma, "tenants", {});
  if (tenants.length === 0) {
    console.log("No tenants found. Nothing to migrate.");
    return;
  }

  // ── 2. Backfill dbName on tenants that don't have one ────────────────────
  console.log(`Found ${tenants.length} tenant(s). Backfilling dbName…\n`);
  for (const tenant of tenants) {
    if (tenant.dbName) {
      console.log(`  ${tenant.name}: already has dbName="${tenant.dbName}"`);
      continue;
    }
    const slug = tenant.slug ?? extractId(tenant);
    const dbName = `hrms-${slug}`;

    await run(masterPrisma, {
      update: "tenants",
      updates: [
        { q: { _id: tenant._id }, u: { $set: { dbName } }, multi: false },
      ],
    });
    tenant.dbName = dbName;
    console.log(`  ${tenant.name}: assigned dbName="${dbName}"`);
  }

  // ── 3. Backfill isSuperUser=true on all tenant owners ────────────────────
  console.log("\nBackfilling isSuperUser for tenant owners…\n");
  const memberships = await findMany(masterPrisma, "tenant_memberships", {
    role: "owner",
  });
  let ownerCount = 0;
  for (const m of memberships) {
    const userId = m.userId?.$oid ?? m.userId?.toString?.() ?? String(m.userId);
    await run(masterPrisma, {
      update: "users",
      updates: [
        {
          q: { _id: oid(userId) },
          u: { $set: { isSuperUser: true } },
          multi: false,
        },
      ],
    });
    ownerCount++;
  }
  console.log(`  Set isSuperUser=true for ${ownerCount} owner(s).`);

  // ── 4. Copy business data into each tenant's database ────────────────────
  console.log("\nCopying business collections to tenant databases…\n");

  for (const tenant of tenants) {
    const tid = extractId(tenant);
    const dbName: string = tenant.dbName;
    const tp = tenantPrisma(dbName);

    console.log(`\n── ${tenant.name} → ${dbName} ──`);

    for (const col of BUSINESS_COLLECTIONS) {
      const masterCount = await countDocs(masterPrisma, col, {
        tenantId: oid(tid),
      });
      if (masterCount === 0) {
        console.log(`  ${col}: nothing to copy`);
        continue;
      }

      const siloCount = await countDocs(tp, col, {});
      if (siloCount >= masterCount) {
        console.log(`  ${col}: already migrated (${siloCount} records)`);
        continue;
      }

      // Fetch all matching docs from master using keyset pagination
      const docs = await findMany(masterPrisma, col, { tenantId: oid(tid) });

      // Get existing IDs in silo to avoid duplicates on re-run
      const existingDocs = siloCount > 0 ? await findMany(tp, col, {}) : [];
      const existingIds = new Set(existingDocs.map(extractId));
      const toInsert = docs.filter((d) => !existingIds.has(extractId(d)));

      if (toInsert.length === 0) {
        console.log(`  ${col}: already migrated (${siloCount} records)`);
        continue;
      }

      const BATCH = 500;
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        const res = await run(tp, { insert: col, documents: batch });
        inserted += res?.n ?? batch.length;
      }
      console.log(`  ${col}: copied ${inserted} records`);
    }

    await tp.$disconnect();
  }

  // ── 5. Cleanup: remove business records from master DB ───────────────────
  if (CLEANUP) {
    console.log(
      "\n\nCleaning up master DB — removing migrated business records…\n",
    );

    const allTenantIds = tenants.map((t: any) => oid(extractId(t)));

    for (const col of BUSINESS_COLLECTIONS) {
      const masterTotal = await countDocs(masterPrisma, col, {
        tenantId: { $in: allTenantIds },
      });
      if (masterTotal === 0) {
        console.log(`  ${col}: nothing to delete`);
        continue;
      }

      // Verify each tenant's data exists in silo before deleting
      let safeToDelete = true;
      for (const tenant of tenants) {
        const tid = extractId(tenant);
        const tenantMasterCount = await countDocs(masterPrisma, col, {
          tenantId: oid(tid),
        });
        if (tenantMasterCount === 0) continue;

        const tp = tenantPrisma(tenant.dbName);
        const siloCount = await countDocs(tp, col, {});
        await tp.$disconnect();

        if (siloCount < tenantMasterCount) {
          console.log(
            `  ${col}: SKIPPING — tenant "${tenant.name}" has ${tenantMasterCount} in master but ${siloCount} in silo`,
          );
          safeToDelete = false;
          break;
        }
      }

      if (!safeToDelete) continue;

      const result = await run(masterPrisma, {
        delete: col,
        deletes: [{ q: { tenantId: { $in: allTenantIds } }, limit: 0 }],
      });
      console.log(
        `  ${col}: deleted ${result?.n ?? "?"} records from master DB`,
      );
    }

    console.log("\n✓ Master DB cleanup complete.");
  } else {
    console.log("\n✓ Migration complete (data copied, master DB untouched).");
    console.log(
      "  Once verified, re-run with --cleanup to remove business data from master DB.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => masterPrisma.$disconnect());
