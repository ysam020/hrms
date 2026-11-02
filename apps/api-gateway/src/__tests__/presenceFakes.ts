// In-memory stand-ins for the presence tests: a Prisma fake that behaves like
// prismaWithTenant (users are master-DB rows filtered to the current tenant;
// presence rows and teams live in a separate store per tenant database) and
// a Redis fake with the handful of commands presenceConnectivity uses.

const tick = () => new Promise((r) => setImmediate(r));
const clone = <T>(v: T): T => (v ? { ...(v as any) } : v);

export interface FakeUser {
  id: string;
  tenantId: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  designation?: string | null;
  department?: string | null;
  employee_photo?: string | null;
  attendanceMode?: string | null;
  employeeStatus?: string;
  isSuperUser?: boolean;
  permissions?: string[];
}

export function createFakeDb() {
  const state = {
    tenant: "tenant-a",
    users: [] as FakeUser[],
    teams: {} as Record<string, { teamLeaderId: string; members: string[] }[]>,
    presence: {} as Record<string, any[]>,
    wfh: {} as Record<string, any[]>,
    memberships: [] as { tenantId: string; userId: string; role: string }[],
    seq: 0,
  };
  const rows = () => (state.presence[state.tenant] ??= []);
  const matches = (r: any, where: any = {}) =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (v && typeof v === "object" && "in" in v) return v.in.includes(r[k]);
      if (v && typeof v === "object" && "notIn" in v)
        return !v.notIn.includes(r[k]);
      return r[k] === v;
    });
  const userWhere = (u: FakeUser, where: any = {}) => {
    if (u.tenantId !== state.tenant) return false; // tenant-scoped user model
    const { OR, employeeStatus, ...rest } = where;
    if (employeeStatus?.notIn?.includes(u.employeeStatus ?? "Active"))
      return false;
    if (!matches(u, rest)) return false;
    if (OR)
      return OR.some((c: any) => {
        const [field, cond] = Object.entries(c)[0] as [string, any];
        return String((u as any)[field] ?? "")
          .toLowerCase()
          .includes(String(cond.contains).toLowerCase());
      });
    return true;
  };

  const db: any = {
    user: {
      findUnique: jest.fn(async ({ where }: any) =>
        clone(state.users.find((u) => userWhere(u, { id: where.id })) ?? null),
      ),
      findMany: jest.fn(async ({ where, take }: any) =>
        state.users
          .filter((u) => userWhere(u, where))
          .slice(0, take ?? Infinity)
          .map(clone),
      ),
    },
    team: {
      findMany: jest.fn(async ({ where }: any) => {
        const id = where.OR[0].teamLeaderId;
        return (state.teams[state.tenant] ?? []).filter(
          (t) => t.teamLeaderId === id || t.members.includes(id),
        );
      }),
    },
    tenantMembership: {
      findFirst: jest.fn(
        async ({ where }: any) =>
          state.memberships.find(
            (m) => m.tenantId === where.tenantId && m.userId === where.userId,
          ) ?? null,
      ),
    },
    wfhRequest: {
      findMany: jest.fn(async ({ where }: any) =>
        (state.wfh[state.tenant] ?? []).filter(
          (w) =>
            where.userId.in.includes(w.userId) && w.status === where.status,
        ),
      ),
    },
    presenceStatus: {
      findFirst: jest.fn(async ({ where }: any) => {
        await tick(); // let concurrent writers interleave
        return clone(rows().find((r) => matches(r, where)) ?? null);
      }),
      findMany: jest.fn(async ({ where }: any) =>
        rows()
          .filter((r) => matches(r, where))
          .map(clone),
      ),
      create: jest.fn(async ({ data }: any) => {
        await tick();
        if (
          rows().some(
            (r) => r.tenantId === data.tenantId && r.userId === data.userId,
          )
        )
          throw Object.assign(new Error("dup"), { code: "P2002" });
        const r = { id: `p${++state.seq}`, createdAt: new Date(), ...data };
        rows().push(r);
        return clone(r);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        await tick();
        let count = 0;
        for (const r of rows())
          if (matches(r, where)) {
            Object.assign(r, data);
            count++;
          }
        return { count };
      }),
    },
  };
  return { db, state };
}

/** Redis fake: hashes, strings (with EX/PXAT/GET), mget, pipelines, publish. */
export function createFakeRedis() {
  const hashes = new Map<string, Map<string, string>>();
  const strings = new Map<string, string>();
  const published: { channel: string; message: string }[] = [];
  const cmds: any = {
    hset: (k: string, f: string, v: string) => {
      (hashes.get(k) ?? hashes.set(k, new Map()).get(k)!).set(f, v);
      return 1;
    },
    hdel: (k: string, f: string) => (hashes.get(k)?.delete(f) ? 1 : 0),
    hvals: (k: string) => [...(hashes.get(k)?.values() ?? [])],
    pexpire: () => 1,
    set: (k: string, v: string, ...opts: any[]) => {
      const before = strings.get(k) ?? null;
      strings.set(k, v);
      return opts.includes("GET") ? before : "OK";
    },
    get: (k: string) => strings.get(k) ?? null,
    del: (k: string) => (strings.delete(k) ? 1 : 0),
    mget: (...ks: string[]) => ks.map((k) => strings.get(k) ?? null),
    publish: (channel: string, message: string) => {
      published.push({ channel, message });
      return 1;
    },
  };
  const batch = () => {
    const queued: [string, any[]][] = [];
    const b: any = new Proxy(
      {},
      {
        get: (_, name: string) =>
          name === "exec"
            ? async () => queued.map(([c, a]) => [null, cmds[c](...a)])
            : (...args: any[]) => {
                queued.push([name, args]);
                return b;
              },
      },
    );
    return b;
  };
  const client: any = { multi: batch, pipeline: batch };
  for (const [name, fn] of Object.entries(cmds))
    client[name] = jest.fn(async (...a: any[]) => (fn as any)(...a));
  return { client, hashes, strings, published };
}
