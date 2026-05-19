/**
 * Randomly assign users that have no tenantId to existing tenants.
 * Creates tenant_memberships for each assignment.
 *
 * Usage (from repo root):
 *   DEV_MONGODB_URI="..." pnpm --filter=@hrms/db exec tsx src/assign-users-to-tenants.ts
 *
 * Safe to re-run — only touches users without a tenantId.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const run = (cmd: Record<string, unknown>): Promise<any> =>
  (prisma.$runCommandRaw as any)(cmd);

function extractId(doc: any): string {
  return doc._id?.$oid ?? doc._id?.toString?.() ?? String(doc._id);
}

function oid(id: string) {
  return { $oid: id };
}

async function findMany(
  collection: string,
  filter: object,
  limit = 100000,
): Promise<any[]> {
  const res = await run({ find: collection, filter, limit });
  return res?.cursor?.firstBatch ?? [];
}

async function main() {
  // ── 1. Fetch all tenants ──────────────────────────────────────────────────
  const tenants = await findMany("tenants", {});
  if (tenants.length === 0) {
    console.error("No tenants found. Create tenants first.");
    process.exit(1);
  }
  console.log(`Found ${tenants.length} tenant(s):`);
  tenants.forEach((t: any) => console.log(`  • ${t.name} (${extractId(t)})`));

  // ── 2. Find users without a tenantId ─────────────────────────────────────
  const noTenantFilter = {
    $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
  };
  const users = await findMany("users", noTenantFilter);

  if (users.length === 0) {
    console.log("\nNo users without a tenant — nothing to do.");
    return;
  }
  console.log(
    `\nFound ${users.length} user(s) without a tenant. Assigning randomly…\n`,
  );

  // ── 3. Randomly group users per tenant ────────────────────────────────────
  const groups = new Map<string, any[]>(
    tenants.map((t: any) => [extractId(t), []]),
  );

  for (const user of users) {
    const tenant = tenants[Math.floor(Math.random() * tenants.length)];
    groups.get(extractId(tenant))!.push(user);
  }

  // ── 4. Persist assignments ────────────────────────────────────────────────
  for (const tenant of tenants) {
    const tid = extractId(tenant);
    const batch = groups.get(tid)!;
    if (batch.length === 0) continue;

    console.log(`Assigning ${batch.length} user(s) to "${tenant.name}"…`);

    const userOids = batch.map((u: any) => u._id);

    // Stamp tenantId on users
    await run({
      update: "users",
      updates: [
        {
          q: { _id: { $in: userOids } },
          u: { $set: { tenantId: oid(tid) } },
          multi: true,
        },
      ],
    });

    // Skip memberships that already exist
    const existingMs = await findMany("tenant_memberships", {
      tenantId: oid(tid),
      userId: { $in: userOids },
    });
    const existingSet = new Set(
      existingMs.map((m: any) => m.userId?.$oid ?? String(m.userId)),
    );

    const toCreate = batch.filter((u: any) => !existingSet.has(extractId(u)));
    if (toCreate.length > 0) {
      await run({
        insert: "tenant_memberships",
        documents: toCreate.map((u: any) => ({
          tenantId: oid(tid),
          userId: u._id,
          role: "employee",
          joinedAt: { $date: new Date().toISOString() },
        })),
      });
    }
    console.log(
      `  ✓ ${toCreate.length} membership(s) created, ${existingSet.size} already existed`,
    );
  }

  console.log("\n✓ Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
