// The gateway's shutdown budget, kept dependency-free so the cluster primary
// (bootstrap.ts) can read it without loading the database or Redis modules
// before secrets are loaded.
//
// Longer than the 8 s the gRPC services use: HTTP requests through the
// gateway wrap downstream gRPC calls and long-lived WebSocket connections.
// docker-compose.prod.yml's stop_grace_period (20 s) must exceed this plus
// the primary's 1 s margin.
export const DEFAULT_GATEWAY_SHUTDOWN_GRACE_MS = 15_000;

export function gatewayShutdownGraceMs(): number {
  const raw = Number(process.env.SHUTDOWN_GRACE_MS);
  return Number.isInteger(raw) && raw > 0
    ? raw
    : DEFAULT_GATEWAY_SHUTDOWN_GRACE_MS;
}
