/**
 * One independent "gateway" process for the integration suites: the REAL
 * authenticate middleware and the REAL Socket.IO stack (configureSocketIO +
 * resolveSocketUserId + enforceSocketAccess + the Redis adapter), against
 * the isolated MongoDB/Redis containers. Started twice by the tests to
 * prove behaviour ACROSS processes (each has its own in-memory caches).
 *
 *   PORT=47101 npx tsx integration/helpers/gatewayProcess.ts
 */
import http from "node:http";

const MONGO = process.env.DEV_MONGODB_URI ?? "";
for (const v of [
  MONGO,
  process.env.REDIS_URL ?? "",
  `redis://${process.env.REDIS_HOST}`,
]) {
  const host = v.replace(/^[a-z+]+:\/\/(?:[^@/]*@)?/, "").split(/[/:?]/)[0];
  if (!["127.0.0.1", "localhost"].includes(host)) {
    console.error(`refusing non-local host "${host}"`);
    process.exit(2);
  }
}

async function main() {
  const express = (await import("express")).default;
  const { authenticate } =
    await import("../../apps/api-gateway/src/middleware/authenticate");
  const { withUserAccessScope } =
    await import("../../apps/api-gateway/src/services/userAccess");
  const { resolveSocketUserId, enforceSocketAccess } =
    await import("../../apps/api-gateway/src/config/socketAuth");
  const { accountAccessHealth } =
    await import("../../apps/api-gateway/src/services/accountAccess");
  // Same module the gateway resolves (@hrms/websocket's main is its source).
  const { configureSocketIO } =
    await import("../../packages/websocket/src/index");

  const app = express();
  app.use((_q, _s, next) => withUserAccessScope(next));
  app.get("/me", authenticate, (req: any, res) =>
    res.json({ userId: req.user.userId, tenantRole: req.user.tenantRole }),
  );
  app.get("/health", (_q, res) =>
    res.json({ pid: process.pid, ...accountAccessHealth() }),
  );

  // Test-only (perf baseline): Prometheus registry + heap after a forced GC.
  const { register } = await import("prom-client");
  app.get("/metrics", async (_q, res) => {
    res.setHeader("Content-Type", register.contentType);
    res.send(await register.metrics());
  });
  app.get("/mem", (_q, res) => {
    (globalThis as any).gc?.();
    const m = process.memoryUsage();
    res.json({ heapUsed: m.heapUsed, rss: m.rss, ...accountAccessHealth() });
  });

  const server = http.createServer(app);
  const { io, redisAdapter } = configureSocketIO(
    server as any,
    ["*"],
    resolveSocketUserId,
  );
  enforceSocketAccess(io, Number(process.env.SOCKET_REVALIDATE_MS) || 1000);

  // Test-only: push one event to a user through the real adapter.
  app.post("/push/:userId", async (req, res) => {
    const ok = await redisAdapter.sendToUser(req.params.userId, "it:ping", {
      at: Date.now(),
    });
    res.json({ ok });
  });

  server.listen(Number(process.env.PORT), "127.0.0.1", () => {
    console.log(`READY ${process.env.PORT} ${process.pid}`);
  });
}

main().catch((err) => {
  console.error("gatewayProcess failed", err);
  process.exit(1);
});
