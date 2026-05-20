import { loadSecrets } from "@hrms/common";

async function bootstrap() {
  await loadSecrets("hrms/config");
  await import("./server");
}

bootstrap().catch((err) => {
  console.error(
    "Failed to start: could not load secrets from AWS Secrets Manager",
  );
  console.error(err instanceof Error ? err.name : "unknown error");
  process.exit(1);
});
