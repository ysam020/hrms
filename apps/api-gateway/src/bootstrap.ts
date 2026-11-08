import cluster from "node:cluster";
import { cpus } from "node:os";

// One worker process per CPU core so the gateway can actually use more than
// a single core — a lone Node process is inherently limited to ~1 core for
// its JS event loop, which under load-testing showed up as a hard ~260 req/s
// throughput ceiling with the gateway container pegged at 130%+ CPU while
// every downstream service and the database sat idle. Set WEB_CONCURRENCY=1
// to disable (e.g. for simpler local debugging where multi-process logs are
// more hassle than they're worth).
const WORKERS = Number(process.env.WEB_CONCURRENCY) || cpus().length;

async function startWorker() {
  // ⚠️ Telemetry must be the very first import — before express, prisma, grpc.
  await import("./telemetry");
  const { loadSecrets, validateEnv } = await import("@hrms/common");
  const { logger } = await import("@hrms/logger");
  const { envSchema } = await import("./envSchema");

  try {
    await loadSecrets("hrms/config");
    validateEnv(envSchema, "api-gateway");
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
  void import("./services/geoLookup").then(({ serveGeoLookups }) =>
    serveGeoLookups(cluster),
  );
  // Forks and respawns the workers; on SIGTERM/SIGINT passes the signal to
  // every worker and waits for them to drain (their budget + 1 s) instead
  // of respawning them. Without this the primary — PID 1 in the container
  // — ignored SIGTERM, the workers' shutdown never ran, and Docker killed
  // the gateway at its stop timeout.
  void Promise.all([
    import("@hrms/common"),
    import("./config/shutdownBudget"),
  ]).then(([{ runClusterPrimary }, { gatewayShutdownGraceMs }]) =>
    runClusterPrimary("api-gateway", WORKERS, cluster, {
      workerGraceMs: gatewayShutdownGraceMs(),
    }),
  );
} else {
  startWorker();
}
