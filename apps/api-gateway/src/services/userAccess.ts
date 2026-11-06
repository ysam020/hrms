import { AsyncLocalStorage } from "node:async_hooks";
import {
  prisma as masterPrisma,
  prismaWithTenant,
  getTenantId,
  recordStage,
} from "@hrms/db";

/**
 * Request-scoped resolution of a user's access fields.
 *
 * Authorisation checks across the gateway (≈ 30 call sites: role guards,
 * superuser checks, `Module:action` permission checks) each used to run
 * their own `user.findUnique` for the same caller, often 2–4 times in one
 * request. loadUserAccess() runs that lookup once per HTTP request and hands
 * every later caller the same result (or the same in-flight promise).
 *
 * Nothing about the decisions changes:
 *  - The fields and their normalisation are exactly what the call sites
 *    read before (`isSuperUser === true`, `permissions ?? []`, …).
 *  - The two lookup flavours stay separate. `tenantScoped: true` matches
 *    `prismaWithTenant.user.findUnique` (master DB, filtered to the current
 *    tenant), `false` matches the unscoped master `prisma`. A user outside
 *    the current tenant still resolves to null on the scoped path.
 *  - Results live only for the request: the store is opened per HTTP
 *    request in server.ts and dropped with it. There is no cross-request
 *    or cross-process cache, so role or permission changes apply on the
 *    next request exactly as before.
 *  - A failed lookup is never memoised: the error reaches the caller (as
 *    before) and the next call queries again. A missing user resolves to
 *    null, which every call site treats as "no access".
 *  - Outside a request scope (sockets, workers, MCP) it is a plain query.
 */
export interface UserAccess {
  isSuperUser: boolean;
  permissions: string[];
  /** User.role: the names of assigned permission roles. */
  role: string[];
  tenantId: string | null;
  username: string | null;
  /** Used by the platform/support guards to block deactivated users. */
  employeeStatus: string;
}

interface AccessScope {
  memo: Map<string, Promise<UserAccess | null>>;
}

const storage = new AsyncLocalStorage<AccessScope>();

// Timing must never break an access check (test doubles of @hrms/db may not
// provide recordStage).
function timing(stage: string, ms: number): void {
  if (typeof recordStage === "function") recordStage(stage, ms);
}

/** Opens the per-request scope (one per HTTP request, see server.ts). */
export function withUserAccessScope<T>(fn: () => T): T {
  return storage.run({ memo: new Map() }, fn);
}

const SELECT = {
  isSuperUser: true,
  permissions: true,
  role: true,
  tenantId: true,
  username: true,
  employeeStatus: true,
} as const;

function normalise(
  row: {
    isSuperUser: boolean | null;
    permissions: unknown;
    role: unknown;
    tenantId: string | null;
    username: string | null;
    employeeStatus: string;
  } | null,
): UserAccess | null {
  if (!row) return null;
  return {
    isSuperUser: row.isSuperUser === true,
    permissions: Array.isArray(row.permissions)
      ? (row.permissions as string[])
      : [],
    role: Array.isArray(row.role) ? (row.role as string[]) : [],
    tenantId: row.tenantId ?? null,
    username: row.username ?? null,
    employeeStatus: row.employeeStatus,
  };
}

async function query(
  userId: string,
  tenantScoped: boolean,
): Promise<UserAccess | null> {
  const started = performance.now();
  try {
    const client = (
      tenantScoped ? prismaWithTenant : masterPrisma
    ) as typeof masterPrisma;
    return normalise(
      await client.user.findUnique({ where: { id: userId }, select: SELECT }),
    );
  } finally {
    timing("userAccess:lookup", performance.now() - started);
  }
}

export function loadUserAccess(
  userId: string,
  opts: { tenantScoped: boolean },
): Promise<UserAccess | null> {
  const scope = storage.getStore();
  if (!scope) return query(userId, opts.tenantScoped);
  // The tenant is part of the key: a scoped lookup's result depends on it.
  const key = opts.tenantScoped
    ? `t:${getTenantId() ?? "-"}:${userId}`
    : `m:${userId}`;
  const hit = scope.memo.get(key);
  if (hit) {
    timing("userAccess:reuse", 0);
    return hit;
  }
  const pending = query(userId, opts.tenantScoped);
  scope.memo.set(key, pending);
  pending.catch(() => {
    if (scope.memo.get(key) === pending) scope.memo.delete(key);
  });
  return pending;
}

/** Drops this request's memoised access for a user after writing to it. */
export function invalidateUserAccess(userId: string): void {
  const scope = storage.getStore();
  if (!scope) return;
  for (const key of [...scope.memo.keys()]) {
    if (key.endsWith(`:${userId}`)) scope.memo.delete(key);
  }
}
