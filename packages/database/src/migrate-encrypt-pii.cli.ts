/**
 * Entry point for the sensitive-field migration. Secrets are loaded before
 * the database client is imported, because the client reads its connection
 * string at import time.
 *
 *   Dry run (default, writes nothing):
 *     node migrate-encrypt-pii.cli.js
 *   Print the fingerprint of this process's active key:
 *     node migrate-encrypt-pii.cli.js --print-key-id
 *   Apply:
 *     CONFIRM_DB_WRITE_HOST=<host> EXPECTED_FIELD_KEY_ID=<kid> \
 *       node migrate-encrypt-pii.cli.js --apply [--batch-size=200] [--state=f]
 *   Undo (restores plaintext from ciphertext):
 *     ... --rollback
 *   Re-seal values held under an older key:
 *     ... --apply --rekey
 */
import { loadSecrets } from "@hrms/common";

async function main() {
  if (!process.env.DEV_MONGODB_URI) await loadSecrets("hrms/config");

  const { activeFieldKeyId } = await import("@hrms/crypto");
  const args = process.argv.slice(2);
  if (args.includes("--print-key-id")) {
    console.log(activeFieldKeyId());
    return;
  }

  const { runPiiMigration, assertMigrationAllowed } =
    await import("./migrate-encrypt-pii");
  const { prisma } = await import("./prismaClient");

  const value = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const mode = args.includes("--rollback")
    ? ("rollback" as const)
    : args.includes("--apply")
      ? ("apply" as const)
      : ("dry-run" as const);

  assertMigrationAllowed(mode);
  const report = await runPiiMigration({
    mode,
    rekey: args.includes("--rekey"),
    batchSize: Number(value("batch-size")) || 200,
    stateFile: value("state"),
  });
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  // The error name only: a driver message can quote a whole document.
  console.error("migrate-encrypt-pii failed:", (err as Error).name);
  process.exit(1);
});
