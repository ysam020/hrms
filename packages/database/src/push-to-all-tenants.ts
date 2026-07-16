/**
 * Fans `prisma db push` out to every tenant's physical database.
 *
 * `prisma db push` only ever targets whichever single DB DEV_MONGODB_URI
 * resolves to — it does not loop over tenant databases on its own, despite
 * wiki/Deployment.md claiming schema changes "affect all databases". Run
 * this after every schema change so new fields/indexes actually reach every
 * tenant DB, not just master (which is all `pnpm db:push` alone would do).
 *
 * Usage (from repo root):
 *   DEV_MONGODB_URI="mongodb+srv://..." pnpm db:migrate
 */

import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const masterPrisma = new PrismaClient({
  datasourceUrl: process.env.DEV_MONGODB_URI,
});

function buildUrl(dbName: string): string {
  const base = process.env.DEV_MONGODB_URI!;
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

async function main() {
  const tenants = await masterPrisma.tenant.findMany({
    where: { dbName: { not: null } },
    select: { name: true, dbName: true },
  });

  if (tenants.length === 0) {
    console.log("No tenants with a dbName found. Nothing to push.");
    return;
  }

  console.log(`Pushing schema to ${tenants.length} tenant database(s)…\n`);

  const failures: string[] = [];
  for (const tenant of tenants) {
    const dbName = tenant.dbName!;
    console.log(`── ${tenant.name} → ${dbName} ──`);
    try {
      execFileSync(
        "pnpm",
        ["exec", "prisma", "db", "push", "--skip-generate"],
        {
          stdio: "inherit",
          env: { ...process.env, DEV_MONGODB_URI: buildUrl(dbName) },
        },
      );
    } catch {
      console.error(`  FAILED: ${dbName}`);
      failures.push(dbName);
    }
  }

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} tenant DB(s) failed: ${failures.join(", ")}`,
    );
    process.exitCode = 1;
  } else {
    console.log("\n✓ Schema pushed to all tenant databases.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => masterPrisma.$disconnect());
