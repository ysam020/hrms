// Counts operations currently using each tenant database client, so the
// pool never disconnects a client while a request, gRPC call or job is
// still running queries on it (see tenantClientPool.ts).

const leases = new Map<object, number>();
const idleWaiters = new Map<object, () => void>();

/**
 * Marks `client` as in use until the returned release function is called.
 * Release is idempotent, so it can be wired to several end events.
 */
export function leaseClient(client: object): () => void {
  leases.set(client, (leases.get(client) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (leases.get(client) ?? 1) - 1;
    if (left > 0) {
      leases.set(client, left);
      return;
    }
    leases.delete(client);
    const waiter = idleWaiters.get(client);
    if (waiter) {
      idleWaiters.delete(client);
      waiter();
    }
  };
}

export function activeLeases(client: object): number {
  return leases.get(client) ?? 0;
}

/** Calls `cb` once `client` has no active lease — now, or on the last release. */
export function whenIdle(client: object, cb: () => void): void {
  if (activeLeases(client) === 0) cb();
  else idleWaiters.set(client, cb);
}

export function cancelWhenIdle(client: object): void {
  idleWaiters.delete(client);
}
