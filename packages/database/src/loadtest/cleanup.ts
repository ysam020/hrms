/**
 * Removes what seed.ts created, and nothing else. For each org in
 * load-testing/.state/manifest.json it first verifies ownership:
 *   - the master tenant row has the manifest's id, a "loadtest-" slug, a
 *     "LOADTEST_" name and the manifest's dbName;
 *   - the tenant database's `_init` document carries marker "LOADTEST" and
 *     this manifest's runId.
 * Only then does it delete, by id AND marker: memberships (tenantId match),
 * users (manifest id + loadtest_ username + tenantId), the tenant database
 * (dropDatabase, hrms-loadtest-* only) and finally the tenant row. Any
 * mismatch aborts that org untouched. Anything else in master that points at
 * the tenant (rows the app may have written during a run) is listed, not
 * deleted, so a human can decide.
 *
 * Usage (repo root): CONFIRM_DB_WRITE_HOST=<atlas host> \
 *   pnpm --filter=@hrms/db exec tsx src/loadtest/cleanup.ts [--dry-run]
 */
import { rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertConfirmedWriteTarget, databaseHost } from "../scriptGuard";
import {
  MANIFEST_PATH,
  buildUrl,
  isLoadtestDb,
  isLoadtestSlug,
  isLoadtestUsername,
  readManifest,
  writeManifest,
} from "./common";

const dryRun = process.argv.includes("--dry-run");
const master = new PrismaClient({ datasourceUrl: process.env.DEV_MONGODB_URI });

async function strayMasterRows(
  tenantId: string,
): Promise<Record<string, number>> {
  const res: any = await (master.$runCommandRaw as any)({
    listCollections: 1,
    nameOnly: true,
  });
  const out: Record<string, number> = {};
  for (const { name } of res.cursor.firstBatch as { name: string }[]) {
    if (name.startsWith("system.")) continue;
    const r: any = await (master.$runCommandRaw as any)({
      count: name,
      query: { $or: [{ tenantId }, { tenantId: { $oid: tenantId } }] },
    });
    if (r.n > 0) out[name] = r.n;
  }
  return out;
}

async function main() {
  if (!dryRun) assertConfirmedWriteTarget("loadtest-cleanup");
  const manifest = readManifest();
  if (!manifest || manifest.orgs.length === 0) {
    console.log(`Nothing to clean: ${MANIFEST_PATH} lists no orgs.`);
    return;
  }
  if (manifest.host !== databaseHost(process.env.DEV_MONGODB_URI)) {
    throw new Error(`Manifest was written for ${manifest.host}; refusing.`);
  }

  const remaining = [];
  for (const org of manifest.orgs) {
    const label = `${org.slug} (${org.tenantId})`;
    const tenant = await master.tenant.findUnique({
      where: { id: org.tenantId },
      select: { name: true, slug: true, dbName: true },
    });
    const tenantOk =
      tenant === null ||
      (tenant.slug === org.slug &&
        isLoadtestSlug(tenant.slug) &&
        tenant.name.startsWith("LOADTEST_") &&
        tenant.dbName === org.dbName);
    if (!tenantOk || !isLoadtestDb(org.dbName)) {
      console.error(
        `✗ ${label}: tenant row does not match the manifest; left untouched.`,
      );
      remaining.push(org);
      continue;
    }

    const tdb = new PrismaClient({ datasourceUrl: buildUrl(org.dbName) });
    try {
      const init: any = await (tdb.$runCommandRaw as any)({
        find: "_init",
        filter: { marker: "LOADTEST" },
        limit: 1,
      });
      const marker = init?.cursor?.firstBatch?.[0];
      const dbExists = marker !== undefined;
      if (dbExists && marker.runId !== manifest.runId) {
        console.error(
          `✗ ${label}: ${org.dbName} marker is for run ${marker.runId}; left untouched.`,
        );
        remaining.push(org);
        continue;
      }

      const userFilter = {
        id: { in: org.userIds },
        tenantId: org.tenantId,
        username: { startsWith: "loadtest_" },
      };
      const users = await master.user.findMany({
        where: userFilter,
        select: { id: true, username: true },
      });
      const badUser = users.find((u) => !isLoadtestUsername(u.username));
      if (badUser) {
        console.error(
          `✗ ${label}: user ${badUser.id} lacks the loadtest_ username pattern; left untouched.`,
        );
        remaining.push(org);
        continue;
      }
      const memberships = await master.tenantMembership.count({
        where: { id: { in: org.membershipIds }, tenantId: org.tenantId },
      });
      console.log(
        `${dryRun ? "[dry-run] would remove" : "Removing"} ${label}: ${memberships} memberships, ${users.length} users, database ${org.dbName}${dbExists ? "" : " (absent)"}, tenant row${tenant ? "" : " (absent)"}`,
      );
      if (dryRun) {
        remaining.push(org);
        continue;
      }

      await master.tenantMembership.deleteMany({
        where: { id: { in: org.membershipIds }, tenantId: org.tenantId },
      });
      await master.user.deleteMany({ where: userFilter });
      if (dbExists) await (tdb.$runCommandRaw as any)({ dropDatabase: 1 });
      const stray = await strayMasterRows(org.tenantId);
      delete stray.tenants;
      if (Object.keys(stray).length > 0) {
        console.warn(
          `  ! other master rows still reference ${org.tenantId} (not deleted): ${JSON.stringify(stray)}`,
        );
      }
      if (tenant) await master.tenant.delete({ where: { id: org.tenantId } });
      console.log(`✓ ${label} removed`);
    } finally {
      await tdb.$disconnect();
    }
  }

  if (dryRun) return;
  if (remaining.length === 0) {
    rmSync(MANIFEST_PATH);
    console.log("All load-test records removed; manifest deleted.");
  } else {
    writeManifest({ ...manifest, orgs: remaining });
    console.log(`${remaining.length} org(s) left in the manifest for review.`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => master.$disconnect());
