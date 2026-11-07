import cluster from "node:cluster";
import { cpus } from "node:os";

// One worker process per CPU core — see apps/api-gateway/src/bootstrap.ts
// for the full rationale. Set WEB_CONCURRENCY=1 to disable.
const WORKERS = Number(process.env.WEB_CONCURRENCY) || cpus().length;

async function startWorker() {
  const { loadSecrets, validateEnv } = await import("@hrms/common");
  const { logger } = await import("@hrms/logger");
  const { envSchema } = await import("./envSchema");

  try {
    await loadSecrets("hrms/config");
    validateEnv(envSchema, "performance-review-service");
    await import("./server");
  } catch (err) {
    logger.error(
      "Failed to start: could not load secrets from AWS Secrets Manager",
    );
    logger.error(err instanceof Error ? err.name : "unknown error");
    process.exit(1);
  }
}

if (cluster.isPrimary && WORKERS > 1) {
  // The primary serves /metrics for all workers (see @hrms/logger).
  void import("@hrms/logger");
  // Forks and respawns the workers; on SIGTERM passes the signal on and
  // waits for them to drain instead of respawning them.
  void import("@hrms/common").then(({ runClusterPrimary }) =>
    runClusterPrimary("performance-review-service", WORKERS, cluster),
  );
} else {
  startWorker();
}
