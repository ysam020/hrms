/**
 * One-time migration: create 2 tenants and distribute existing users between them.
 *
 * Usage (from repo root):
 *   DEV_MONGODB_URI="mongodb://localhost:27017/hrms" pnpm --filter=@hrms/db exec tsx src/seed-tenants.ts
 *
 * Uses only $runCommandRaw so it works on standalone MongoDB (no replica set required).
 * Idempotent: safe to run multiple times.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const run = (cmd: Record<string, unknown>): Promise<any> =>
  (prisma.$runCommandRaw as any)(cmd);

const TENANTS = [
  { name: "Acme Corporation", slug: "acme-corporation" },
  { name: "Globex Industries", slug: "globex-industries" },
];

async function findOne(
  collection: string,
  filter: object,
): Promise<any | null> {
  const res = await run({ find: collection, filter, limit: 1 });
  return res?.cursor?.firstBatch?.[0] ?? null;
}

async function findMany(
  collection: string,
  filter: object,
  limit = 10000,
): Promise<any[]> {
  const res = await run({ find: collection, filter, limit });
  return res?.cursor?.firstBatch ?? [];
}

function oid(id: string) {
  return { $oid: id };
}

function extractId(doc: any): string {
  return doc._id?.$oid ?? doc._id?.toString?.() ?? String(doc._id);
}

function extractRef(val: any): string | null {
  if (!val) return null;
  return val.$oid ?? val.toString?.() ?? String(val);
}

async function main() {
  // ── 1. Create tenants (find-or-insert) ───────────────────────────────────
  const tenantRecords: any[] = [];
  for (const t of TENANTS) {
    let tenant = await findOne("tenants", { slug: t.slug });
    if (tenant) {
      console.log(`Tenant exists: ${t.name} (${extractId(tenant)})`);
    } else {
      const res = await run({
        insert: "tenants",
        documents: [
          {
            name: t.name,
            slug: t.slug,
            plan: "free",
            isActive: true,
            createdAt: new Date(),
          },
        ],
      });
      if (res?.n !== 1 && res?.ok !== 1)
        throw new Error(`Failed to insert tenant ${t.name}`);
      tenant = await findOne("tenants", { slug: t.slug });
      console.log(`Created tenant: ${t.name} (${extractId(tenant)})`);
    }
    tenantRecords.push(tenant);
  }

  const [tenant1, tenant2] = tenantRecords;
  const t1Id = extractId(tenant1);
  const t2Id = extractId(tenant2);

  // ── 2. Find users without a tenant ───────────────────────────────────────
  const nullFilter = {
    $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
  };
  const users = await findMany("users", nullFilter);
  console.log(`\nFound ${users.length} users without a tenant`);

  const half = Math.ceil(users.length / 2);
  const batches = [
    { tenantId: t1Id, users: users.slice(0, half) },
    { tenantId: t2Id, users: users.slice(half) },
  ];

  for (const { tenantId, users: batch } of batches) {
    if (batch.length === 0) continue;
    const tenantName = tenantId === t1Id ? tenant1.name : tenant2.name;
    console.log(`\nAssigning ${batch.length} users to "${tenantName}"…`);

    const userOids = batch.map((u: any) => u._id);

    // Stamp tenantId on users
    const upRes = await run({
      update: "users",
      updates: [
        {
          q: { _id: { $in: userOids } },
          u: { $set: { tenantId: oid(tenantId) } },
          multi: true,
        },
      ],
    });
    console.log(`  user stamps: ${upRes?.nModified ?? upRes?.n ?? "?"}`);

    // Check existing memberships
    const existingMs = await findMany("tenant_memberships", {
      tenantId: oid(tenantId),
      userId: { $in: userOids },
    });
    const existingSet = new Set(
      existingMs.map((m: any) => extractRef(m.userId)),
    );

    const toCreate = batch.filter((u: any) => !existingSet.has(extractId(u)));

    if (toCreate.length > 0) {
      const now = new Date();
      await run({
        insert: "tenant_memberships",
        documents: toCreate.map((u: any) => ({
          tenantId: oid(tenantId),
          userId: u._id,
          role: "employee",
          joinedAt: now,
        })),
      });
    }
    console.log(
      `  → ${toCreate.length} memberships created, ${existingSet.size} already existed`,
    );
  }

  // ── 3. Build userId → tenantId map ───────────────────────────────────────
  console.log("\nBuilding user→tenant map…");
  const stampedUsers = await findMany("users", {
    tenantId: { $exists: true, $ne: null },
  });
  const userTenantMap = new Map<string, string>(
    stampedUsers.map((u: any) => [extractId(u), extractRef(u.tenantId)!]),
  );
  console.log(`  ${userTenantMap.size} users mapped`);

  // ── 4. Stamp tenantId on all unscoped records ─────────────────────────────

  // User-scoped collections: look up tenantId from the record's userId/senderId
  const userScoped: Array<{ collection: string; field: string }> = [
    { collection: "attendance_records", field: "userId" },
    { collection: "leaves", field: "userId" },
    { collection: "leavebalances", field: "userId" },
    { collection: "salarystructures", field: "userId" },
    { collection: "notification_recipients", field: "userId" },
    { collection: "auditlogs", field: "userId" },
    { collection: "resignations", field: "userId" },
    { collection: "login_events", field: "userId" },
    { collection: "messages", field: "senderId" },
  ];

  for (const { collection, field } of userScoped) {
    const docs = await findMany(collection, nullFilter);
    if (docs.length === 0) {
      console.log(`  ${collection}: already stamped`);
      continue;
    }

    // Group by resolved tenantId to do fewer update calls
    const byTenant = new Map<string, any[]>();
    for (const doc of docs) {
      const uid = extractRef(doc[field]);
      const tid = uid ? (userTenantMap.get(uid) ?? t1Id) : t1Id;
      if (!byTenant.has(tid)) byTenant.set(tid, []);
      byTenant.get(tid)!.push(doc._id);
    }

    let total = 0;
    for (const [tid, ids] of byTenant) {
      const res = await run({
        update: collection,
        updates: [
          {
            q: { _id: { $in: ids } },
            u: { $set: { tenantId: oid(tid) } },
            multi: true,
          },
        ],
      });
      total += res?.nModified ?? res?.n ?? ids.length;
    }
    console.log(`  ${collection}: stamped ${total} records`);
  }

  // Global collections: assign everything unscoped to tenant1
  const globalCollections = [
    "notifications",
    "hractivities",
    "chatrooms",
    "holidays",
    "policies",
    "rules",
    "roles",
    "teams",
    "jobopenings",
    "jobapplications",
  ];

  for (const collection of globalCollections) {
    const res = await run({
      update: collection,
      updates: [
        { q: nullFilter, u: { $set: { tenantId: oid(t1Id) } }, multi: true },
      ],
    });
    const n = res?.nModified ?? res?.n ?? 0;
    console.log(`  ${collection}: stamped ${n} records → tenant1`);
  }

  console.log("\n✓ Migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
