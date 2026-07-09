/**
 * Generic multi-tenant demo-data seed script.
 *
 * Usage: `pnpm db:seed` (root) or `pnpm --filter=@hrms/db db:seed`.
 *
 * Iterates every active tenant with a provisioned physical DB (Tenant.dbName)
 * and seeds realistic fixture data across org structure, employees, job
 * openings/applications, assets, attendance, leave, HR activities, and
 * payroll — in FK dependency order. Idempotent: skips any tenant that
 * already looks seeded (employee count above a small threshold) instead of
 * duplicating data on repeated runs. Actual seeding logic lives in
 * seedRunner.ts.
 *
 * Hard-guarded to local dev only — see assertLocalDevEnvironment() below.
 * This script inserts bulk fake data and must never run against a real
 * tenant DB.
 */
import { loadSecrets } from "@hrms/common";
import { logger } from "@hrms/logger";

// Unlike every service's bootstrap.ts (which defaults to the prod secret
// "hrms/config" and relies on AWS_SECRET_NAME=hrms/config/docker being set
// by docker-compose.dev.yml to opt into dev), this script defaults straight
// to the dev secret — it has no legitimate prod use case, and the whole
// point is for `pnpm db:seed` to work locally with zero env setup. Still
// honors an AWS_SECRET_NAME override if one happens to be set.
const DEV_SECRET_NAME = "hrms/config/docker";

// ─── Dev-only guard ─────────────────────────────────────────────────────────
// Mirrors apps/scheduler-service's recurring-job guard: CLIENT_URL is loaded
// from AWS Secrets Manager at process start (loadSecrets()) and is reliably
// "https://localhost" for the local dev secret (hrms/config/docker) vs the
// real domain for the production secret (hrms/config) — confirmed by reading
// both secrets directly. No new env var needed.
function assertLocalDevEnvironment(): void {
  const clientUrl = process.env.CLIENT_URL ?? "";
  if (!clientUrl.startsWith("https://localhost")) {
    throw new Error(
      `db:seed refused to run: CLIENT_URL="${clientUrl}" does not look like local dev ` +
        `(expected it to start with "https://localhost"). This script inserts bulk ` +
        "fake data and must never run against a real tenant database.",
    );
  }
}

async function main(): Promise<void> {
  await loadSecrets(DEV_SECRET_NAME);
  assertLocalDevEnvironment();

  // Dynamic import so @hrms/db (and therefore PrismaClient) only initializes
  // after DEV_MONGODB_URI is populated in process.env — mirrors every
  // service's bootstrap.ts (`await loadSecrets(...)` then `await
  // import("./server")`). A static top-level import here would construct
  // PrismaClient before loadSecrets() runs, leaving DEV_MONGODB_URI unset.
  const { runSeed } = await import("./seedRunner");
  const errors = await runSeed();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  logger.error("db:seed: fatal error", { err });
  process.exit(1);
});
