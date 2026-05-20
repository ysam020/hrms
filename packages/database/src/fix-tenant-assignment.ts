/**
 * Comprehensive tenant assignment fix.
 *
 * 1. Merges the orphaned tenant's users and records → Acme Corp
 * 2. Re-builds userId→tenantId map
 * 3. Sets tenantId on all null-tenantId records via userId lookup (batch loop)
 * 4. Assigns non-userId collections → Acme Corp
 *
 * Usage:
 *   DEV_MONGODB_URI="..." pnpm --filter=@hrms/db exec tsx src/fix-tenant-assignment.ts
 */

import { PrismaClient } from "@prisma/client";

const p = new PrismaClient({ datasourceUrl: process.env.DEV_MONGODB_URI });
const run = (cmd: Record<string, unknown>): Promise<any> =>
  (p.$runCommandRaw as any)(cmd);

async function updateMany(col: string, q: object, u: object): Promise<number> {
  const result = await run({ update: col, updates: [{ q, u, multi: true }] });
  return result?.nModified ?? result?.n ?? 0;
}

function extractId(doc: any): string {
  return doc._id?.$oid ?? doc._id?.toString?.() ?? String(doc._id);
}

const ACME_ID = "6a0abf929bfb967806f102d6";
const ORPHANED_ID = "6a0b5414d5fbfceadb9b1e18";

const USER_ID_COLS = [
  "attendance_records",
  "leaves",
  "leavebalances",
  "salarystructures",
  "notifications",
  "notification_recipients",
  "login_events",
  "resignations",
];

const ACME_ONLY_COLS = [
  "hractivities",
  "jobopenings",
  "jobapplications",
  "roles",
  "holidays",
  "policies",
  "rules",
  "teams",
  "chatrooms",
  "messages",
  "auditlogs",
];

async function main() {
  // ── Step 1: Merge orphaned tenant → Acme Corp ─────────────────────────────
  console.log(`\n── Step 1: Merging orphaned tenant → Acme Corp ──`);
  for (const col of ["users", ...USER_ID_COLS, ...ACME_ONLY_COLS]) {
    const n = await updateMany(
      col,
      { tenantId: { $oid: ORPHANED_ID } },
      { $set: { tenantId: { $oid: ACME_ID } } },
    );
    if (n > 0) console.log(`  ${col}: ${n} orphaned records merged`);
  }

  // ── Step 2: Build userId → tenantId map ───────────────────────────────────
  console.log("\n── Step 2: Building userId→tenantId map ──");
  const userTenantMap = new Map<string, string>();
  // Paginate users using fetch-and-remember (no cursor needed, just paginate by _id)
  let lastId: string | null = null;
  while (true) {
    const filter: any = {};
    if (lastId) filter._id = { $gt: { $oid: lastId } };
    const res = await run({
      find: "users",
      filter,
      sort: { _id: 1 },
      limit: 200,
    });
    const batch: any[] = res?.cursor?.firstBatch ?? [];
    if (batch.length === 0) break;
    for (const u of batch) {
      const uid = extractId(u);
      const rawTid = u.tenantId;
      const tid =
        rawTid?.$oid ??
        rawTid?.toString?.() ??
        (typeof rawTid === "string" ? rawTid : null);
      if (uid && tid) userTenantMap.set(uid, tid);
      lastId = uid;
    }
    if (batch.length < 200) break;
  }
  console.log(`  ${userTenantMap.size} users mapped.`);

  // ── Step 3: Assign null-tenantId records via userId (fetch-and-update loop) ─
  console.log("\n── Step 3: Assigning null-tenantId records via userId ──");

  for (const col of USER_ID_COLS) {
    let totalSet = 0;
    let totalUnmapped = 0;
    let iterations = 0;
    const MAX_ITER = 50000; // safety limit

    while (iterations++ < MAX_ITER) {
      // Fetch a batch of null-tenantId records
      const res = await run({
        find: col,
        filter: { tenantId: null },
        limit: 100,
      });
      const batch: any[] = res?.cursor?.firstBatch ?? [];
      if (batch.length === 0) break;

      // Group by tenantId
      const toUpdate = new Map<string, string[]>(); // tenantId → docIds
      const unmappedIds: string[] = [];

      for (const doc of batch) {
        const docId = extractId(doc);
        const rawUid = doc.userId;
        const uid =
          rawUid?.$oid ??
          rawUid?.toString?.() ??
          (typeof rawUid === "string" ? rawUid : null);
        const tid = uid ? userTenantMap.get(uid) : undefined;
        if (tid) {
          if (!toUpdate.has(tid)) toUpdate.set(tid, []);
          toUpdate.get(tid)!.push(docId);
        } else {
          unmappedIds.push(docId);
        }
      }

      // Perform updates
      for (const [tid, ids] of toUpdate) {
        const result = await run({
          update: col,
          updates: [
            {
              q: { _id: { $in: ids.map((id) => ({ $oid: id })) } },
              u: { $set: { tenantId: { $oid: tid } } },
              multi: true,
            },
          ],
        });
        totalSet += result?.nModified ?? result?.n ?? 0;
      }

      // Mark unmapped records with a sentinel to skip them in future iterations
      // (set to Acme Corp as fallback — they have a userId but no matching user in DB)
      if (unmappedIds.length > 0) {
        await run({
          update: col,
          updates: [
            {
              q: { _id: { $in: unmappedIds.map((id) => ({ $oid: id })) } },
              u: { $set: { tenantId: { $oid: ACME_ID } } },
              multi: true,
            },
          ],
        });
        totalUnmapped += unmappedIds.length;
        totalSet += unmappedIds.length;
      }
    }

    const unmappedMsg =
      totalUnmapped > 0
        ? ` (${totalUnmapped} had no matching user — assigned to Acme Corp)`
        : "";
    console.log(`  ${col}: processed ${totalSet} records${unmappedMsg}`);
  }

  // ── Step 4: Assign null-tenantId non-userId collections → Acme Corp ───────
  console.log("\n── Step 4: Assigning tenant-level collections → Acme Corp ──");
  for (const col of ACME_ONLY_COLS) {
    const n = await updateMany(
      col,
      { tenantId: null },
      { $set: { tenantId: { $oid: ACME_ID } } },
    );
    if (n > 0) console.log(`  ${col}: ${n} records assigned`);
    else console.log(`  ${col}: already fully assigned`);
  }

  console.log(
    "\n✓ Done. Re-run migrate-to-silo.ts to copy data to tenant DBs.",
  );
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
