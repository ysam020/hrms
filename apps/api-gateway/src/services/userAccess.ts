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
 * One deliberate rule on top of the lookup (see scopeToTenant):
 * isSuperUser / permissions / role count only in the user's home
 * organisation. Otherwise the decisions are those of a plain lookup:
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

/** The tenant the current request/job is bound to (runWithTenant), if any. */
function boundTenantId(): string | null {
  return typeof getTenantId === "function" ? (getTenantId() ?? null) : null;
}

/**
 * `isSuperUser`, `permissions` and `role` are stored once on the
 * shared master `users` document, and they were granted by the person's
 * HOME organisation (`users.tenantId`) — creating an organisation sets
 * isSuperUser, an admin of that organisation edits permissions. They are
 * therefore only ever honoured when the tenant being acted in IS that home
 * tenant. In any other tenant (a second membership), or with no tenant bound
 * at all, the person has none of them and is governed solely by their
 * membership role (`tenantRole` in the token).
 *
 * Exported so guards that already hold a record can apply the same rule.
 */
export function scopeToTenant(
  access: UserAccess | null,
  tenantId: string | null | undefined,
): UserAccess | null {
  if (!access) return null;
  if (tenantId && access.tenantId === tenantId) return access;
  return { ...access, isSuperUser: false, permissions: [], role: [] };
}

async function query(
  userId: string,
  tenantScoped: boolean,
  tenantId: string | null,
): Promise<UserAccess | null> {
  const started = performance.now();
  try {
    const client = (
      tenantScoped ? prismaWithTenant : masterPrisma
    ) as typeof masterPrisma;
    const access = normalise(
      await client.user.findUnique({ where: { id: userId }, select: SELECT }),
    );
    if (!tenantScoped) {
      // Unscoped: the master record may belong to any organisation. Every
      // caller of this flavour must pass the result through
      // scopeToTenant(record, req.user.tenantId) itself (all do: the guards
      // in authenticate.ts, tenant.ts, support.ts, supportStore.ts,
      // platformAccess.ts). As defence in depth, privileges are also dropped
      // here when a tenant is bound and the record isn't from it.
      return tenantId ? scopeToTenant(access, tenantId) : access;
    }
    // Scoped: prismaWithTenant injects `tenantId` into the where clause, so a
    // record is only returned for the bound tenant — but only when a tenant
    // IS bound; with none it applies no filter, so privileges are dropped.
    return tenantId ? access : scopeToTenant(access, null);
  } finally {
    timing("userAccess:lookup", performance.now() - started);
  }
}

export function loadUserAccess(
  userId: string,
  opts: { tenantScoped: boolean },
): Promise<UserAccess | null> {
  const tenantId = boundTenantId();
  const scope = storage.getStore();
  if (!scope) return query(userId, opts.tenantScoped, tenantId);
  // The tenant is part of both keys: both results depend on it (scoped
  // lookups filter by it, and privileges are scoped to it — scopeToTenant).
  const key = opts.tenantScoped
    ? `t:${tenantId ?? "-"}:${userId}`
    : `m:${tenantId ?? "-"}:${userId}`;
  const hit = scope.memo.get(key);
  if (hit) {
    timing("userAccess:reuse", 0);
    return hit;
  }
  const pending = query(userId, opts.tenantScoped, tenantId);
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
