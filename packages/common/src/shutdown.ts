import type { Cluster } from "node:cluster";
import { logger } from "@hrms/logger";

// Graceful shutdown for long-running service processes.
//
// Services run as PID 1 in their containers. PID 1 gets no default action
// for SIGTERM, so a process without a handler ignores `docker stop` until
// SIGKILL arrives, killing in-flight gRPC calls and queue jobs mid-way. A
// gRPC call cut off that way reaches the gateway as UNAVAILABLE, which it
// retries — re-running a mutation the dead process may already have
// committed. Under node:cluster only the primary receives the signal, so it
// must pass it on to its workers and wait for them.
//
// Steps run in three phases, each finishing before the next starts:
//   drain   — stop taking new work and let in-flight work finish
//             (gRPC servers, BullMQ workers); steps run in parallel
//   cleanup — close what the drained work was using (queues, database
//             clients); only after drain, so nothing still running loses
//             its connection
//   flush   — telemetry, last and briefly
// Each phase has a deadline inside the overall budget; a step that misses
// it is reported and the next phase starts anyway.

export type ShutdownPhase = "drain" | "cleanup" | "flush";
const PHASES: ShutdownPhase[] = ["drain", "cleanup", "flush"];

/**
 * Overall budget. Below Docker's default 10 s stop timeout, so a container
 * stopped with defaults still exits on its own; docker-compose.prod.yml
 * gives backend services 20 s (stop_grace_period). The API gateway uses a
 * longer budget of its own (see its config/gracefulShutdown.ts). Override
 * with SHUTDOWN_GRACE_MS.
 */
export const DEFAULT_SHUTDOWN_GRACE_MS = 8_000;
const CLEANUP_RESERVE_MS = 1_500;
const FLUSH_RESERVE_MS = 500;
// A cluster primary outlives its workers' own budget by this much.
const PRIMARY_EXTRA_MS = 1_000;

export function shutdownGraceMs(): number {
  const raw = Number(process.env.SHUTDOWN_GRACE_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_SHUTDOWN_GRACE_MS;
}

type Exit = (code: number) => void;
/** A step gets the milliseconds left in its phase. */
type Step = (timeoutMs: number) => Promise<unknown>;

export interface GracefulShutdown {
  onShutdown(name: string, step: Step, phase?: ShutdownPhase): void;
  /** Runs every phase once, then exits 0 — or 1 if any step failed or timed out. */
  shutdown(signal: string): Promise<void>;
  isShuttingDown(): boolean;
}

export interface GracefulShutdownOptions {
  graceMs?: number;
  /** Time kept back from drain for cleanup + flush; 0 for a cluster primary. */
  cleanupReserveMs?: number;
  flushReserveMs?: number;
  exit?: Exit;
}

class StepTimeout extends Error {}

function withTimeout(work: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new StepTimeout()), Math.max(ms, 0));
    timer.unref?.();
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export function createGracefulShutdown(
  service: string,
  {
    graceMs = shutdownGraceMs(),
    cleanupReserveMs = CLEANUP_RESERVE_MS,
    flushReserveMs = FLUSH_RESERVE_MS,
    exit = (code: number) => process.exit(code),
  }: GracefulShutdownOptions = {},
): GracefulShutdown {
  const steps: { name: string; step: Step; phase: ShutdownPhase }[] = [];
  let running: Promise<void> | null = null;

  const shutdown = (signal: string): Promise<void> => {
    running ??= (async () => {
      const started = Date.now();
      const phaseEnd: Record<ShutdownPhase, number> = {
        drain: started + graceMs - cleanupReserveMs - flushReserveMs,
        cleanup: started + graceMs - flushReserveMs,
        flush: started + graceMs,
      };
      logger.info(
        `${service}: ${signal} received — shutting down (budget ${graceMs} ms)`,
      );
      let failed = false;
      for (const phase of PHASES) {
        const remaining = phaseEnd[phase] - Date.now();
        await Promise.all(
          steps
            .filter((s) => s.phase === phase)
            .map(async ({ name, step }) => {
              try {
                await withTimeout(
                  Promise.resolve().then(() => step(remaining)),
                  remaining,
                );
              } catch (err) {
                failed = true;
                if (err instanceof StepTimeout) {
                  logger.error(
                    `${service}: shutdown step "${name}" did not finish within ${Math.max(remaining, 0)} ms — continuing`,
                  );
                } else {
                  logger.error(`${service}: shutdown step "${name}" failed`, {
                    err,
                  });
                }
              }
            }),
        );
      }
      logger.info(
        `${service}: shutdown ${failed ? "finished with errors" : "complete"} in ${Date.now() - started} ms`,
      );
      exit(failed ? 1 : 0);
    })();
    return running;
  };

  return {
    onShutdown: (name, step, phase = "drain") => {
      steps.push({ name, step, phase });
    },
    shutdown,
    isShuttingDown: () => running !== null,
  };
}

const signalsHandled = new WeakSet<GracefulShutdown>();

/** Installs SIGTERM/SIGINT handlers that run `graceful.shutdown`, once per instance. */
export function handleShutdownSignals(graceful: GracefulShutdown): void {
  if (signalsHandled.has(graceful)) return;
  signalsHandled.add(graceful);
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => void graceful.shutdown(signal));
  }
}

let processInstance: GracefulShutdown | null = null;

/**
 * The process's single shutdown coordinator, with signal handlers
 * installed. Everything a process runs (its gRPC server, queue workers,
 * database clients) registers steps here, so one signal drains them all in
 * phase order and the process exits once.
 */
export function processShutdown(
  service: string,
  options?: GracefulShutdownOptions,
): GracefulShutdown {
  if (!processInstance) {
    processInstance = createGracefulShutdown(service, options);
    handleShutdownSignals(processInstance);
  }
  return processInstance;
}

/** Test-only: forget the process coordinator. */
export function resetProcessShutdownForTests(): void {
  processInstance = null;
}

/**
 * Runs a node:cluster primary: forks `workerCount` workers and respawns any
 * that die — except during shutdown, when it passes the signal to every
 * worker and waits for them to exit (up to their own budget plus a margin).
 */
export function runClusterPrimary(
  service: string,
  workerCount: number,
  clusterModule: Cluster,
  {
    exit,
    workerGraceMs = shutdownGraceMs(),
  }: {
    exit?: Exit;
    /** The workers' own shutdown budget; the primary waits this + 1 s. */
    workerGraceMs?: number;
  } = {},
): GracefulShutdown {
  const graceful = createGracefulShutdown(`${service} primary`, {
    graceMs: workerGraceMs + PRIMARY_EXTRA_MS,
    cleanupReserveMs: 0,
    flushReserveMs: 0,
    exit,
  });
  graceful.onShutdown("cluster workers", async () => {
    const workers = Object.values(clusterModule.workers ?? {}).filter(
      (w): w is NonNullable<typeof w> => !!w && !w.isDead(),
    );
    const codes = await Promise.all(
      workers.map(
        (worker) =>
          new Promise<number | null>((resolve) => {
            worker.once("exit", (code: number | null) => resolve(code));
            worker.process.kill("SIGTERM");
          }),
      ),
    );
    // A worker whose own shutdown failed or timed out exits 1; report it
    // through the primary's exit code rather than masking it with 0.
    const failed = codes.filter((code) => code !== 0).length;
    if (failed > 0) {
      throw new Error(`${failed} worker(s) did not shut down cleanly`);
    }
  });
  handleShutdownSignals(graceful);

  // eslint-disable-next-line no-console
  console.log(
    `${service} primary ${process.pid}: forking ${workerCount} workers`,
  );
  for (let i = 0; i < workerCount; i++) clusterModule.fork();
  clusterModule.on("exit", (worker, code, signal) => {
    if (graceful.isShuttingDown()) return;
    // eslint-disable-next-line no-console
    console.error(
      `${service} worker ${worker.process.pid} exited (${signal || code}) — respawning`,
    );
    clusterModule.fork();
  });
  return graceful;
}
