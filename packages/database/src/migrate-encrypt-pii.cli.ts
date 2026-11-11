/**
 * Field-encryption migration. Secrets are loaded before the database client
 * is imported, because the client reads its connection string at import.
 *
 *   node migrate-encrypt-pii.cli.js [--dry-run]           counts only (default)
 *   node migrate-encrypt-pii.cli.js --verify              plaintext left, per collection
 *   node migrate-encrypt-pii.cli.js --print-kek-id
 *   CONFIRM_DB_WRITE_HOST=<host> EXPECTED_KEK_ID=<kek> \
 *     node migrate-encrypt-pii.cli.js --apply [--rekey]
 *   ... --rollback                                         restores plaintext
 *
 * Options: --database=master|tenant|all  --tenant=<dbName> (repeatable)
 *          --model=<Model> (repeatable)  --batch-size=200  --restart
 *          --set-validation=moderate|strict   applies validators after a
 *                                             complete, clean apply/verify
 */
import { loadSecrets } from "@hrms/common";

async function main() {
  if (!process.env.DEV_MONGODB_URI) await loadSecrets("hrms/config");
  const args = process.argv.slice(2);
  const value = (n: string) =>
    args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
  const values = (n: string) =>
    args.filter((a) => a.startsWith(`--${n}=`)).map((a) => a.split("=")[1]);

  const { kekProviderFromEnv } = await import("./fieldKeys");
  if (args.includes("--print-kek-id")) {
    console.log(kekProviderFromEnv().kekId);
    return;
  }
  const { runPiiMigration, assertMigrationAllowed, discoverTenantDatabases } =
    await import("./migrate-encrypt-pii");
  const { prisma } = await import("./prismaClient");
  const { getClientForDb, closeAllTenantClients } =
    await import("./tenantClientPool");
  const {
    ensureFieldValidators,
    MASTER_PROTECTED_MODELS,
    TENANT_PROTECTED_MODELS,
  } = await import("./fieldValidators");

  const mode = args.includes("--rollback")
    ? ("rollback" as const)
    : args.includes("--apply")
      ? ("apply" as const)
      : args.includes("--verify")
        ? ("verify" as const)
        : ("dry-run" as const);
  const database = (value("database") ?? "all") as "master" | "tenant" | "all";
  assertMigrationAllowed(mode);
  const report = await runPiiMigration({
    mode,
    database,
    tenants: values("tenant"),
    models: values("model"),
    rekey: args.includes("--rekey"),
    batchSize: Number(value("batch-size")) || 200,
    restart: args.includes("--restart"),
  });
  console.log(JSON.stringify(report, null, 2));

  const level = value("set-validation") as "moderate" | "strict" | undefined;
  if (level) {
    const clean =
      report.complete &&
      report.totals.fieldsUnreadable === 0 &&
      report.totals.documentsFailedVerification === 0 &&
      (mode === "verify" ? report.totals.documentsChanged === 0 : true);
    if (!clean)
      throw new Error(
        "validators not changed: the run was not complete and clean",
      );
    assertMigrationAllowed("apply");
    if (database !== "tenant")
      await ensureFieldValidators(prisma, MASTER_PROTECTED_MODELS, level);
    if (database !== "master") {
      for (const db of await discoverTenantDatabases(values("tenant"))) {
        await ensureFieldValidators(
          getClientForDb(db),
          TENANT_PROTECTED_MODELS,
          level,
        );
      }
    }
    console.log(`validators set to ${level}`);
  }
  await closeAllTenantClients();
  await prisma.$disconnect();
}

main().catch((err) => {
  const message = (err as Error).message ?? "";
  console.error(
    message.startsWith("migrate-encrypt-pii refused") ||
      message.startsWith("validators not changed")
      ? message
      : `migrate-encrypt-pii failed: ${(err as Error).name}`,
  );
  process.exit(1);
});
