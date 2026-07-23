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
  // eslint-disable-next-line no-console
  console.log(`api-gateway primary ${process.pid}: forking ${WORKERS} workers`);
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  cluster.on("exit", (worker, code, signal) => {
    // eslint-disable-next-line no-console
    console.error(
      `api-gateway worker ${worker.process.pid} exited (${signal || code}) — respawning`,
    );
    cluster.fork();
  });
} else {
  startWorker();
}
