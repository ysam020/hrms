/**
 * A small in-memory stand-in for the master Prisma client, covering exactly
 * the operations and `where` operators the support handlers use. Lets the
 * support tests assert outcomes against real data (two tenants, real
 * filtering) instead of asserting on mocked query shapes. $transaction rolls
 * every table back if the callback throws, like the real one.
 */
type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

const DEFAULTS: Record<string, () => Row> = {
  supportTicket: () => ({
    status: "open",
    version: 0,
    reopenCount: 0,
    participantIds: [],
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    lastReopenedAt: null,
    module: null,
    details: null,
    assigneeId: null,
    duplicateOfId: null,
  }),
  supportAttachment: () => ({ visibility: "public", status: "pending" }),
};

let tables: Tables = {};
let idSeq = 0;
const newId = () => (++idSeq).toString(16).padStart(24, "0");

const isPlainObject = (v: unknown) =>
  !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
const eq = (a: any, b: any) =>
  a instanceof Date || b instanceof Date
    ? a != null && b != null && new Date(a).getTime() === new Date(b).getTime()
    : a === b;
const cmp = (a: any, b: any) => {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  return x < y ? -1 : x > y ? 1 : 0;
};

export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "AND") return (cond as Row[]).every((w) => matches(row, w));
    if (key === "OR") return (cond as Row[]).some((w) => matches(row, w));
    const val = row[key];
    if (cond === null) return val == null;
    if (!isPlainObject(cond)) return eq(val, cond);
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case "in":
          return (arg as any[]).some((a) => eq(val, a));
        case "not":
          return arg === null ? val != null : !eq(val, arg);
        case "contains":
          return (
            typeof val === "string" &&
            (cond.mode === "insensitive"
              ? val.toLowerCase().includes(String(arg).toLowerCase())
              : val.includes(String(arg)))
          );
        case "mode":
          return true;
        case "gte":
          return val != null && cmp(val, arg) >= 0;
        case "lte":
          return val != null && cmp(val, arg) <= 0;
        case "equals":
          return eq(val, arg);
        case "has":
          return Array.isArray(val) && val.includes(arg);
        default:
          throw new Error(`fakeDb: unsupported operator ${op}`);
      }
    });
  });
}

function apply(row: Row, data: Row, model: string) {
  for (const [k, v] of Object.entries(data)) {
    if (isPlainObject(v) && "increment" in v)
      row[k] = (row[k] ?? 0) + v.increment;
    else if (v !== undefined) row[k] = v;
  }
  if (model === "supportTicket") row.updatedAt = new Date();
}

function model(name: string) {
  const rows = () => (tables[name] ??= []);
  const sort = (list: Row[], orderBy?: Row) => {
    if (!orderBy) return list;
    const [[field, dir]] = Object.entries(orderBy);
    return [...list].sort(
      (a, b) => cmp(a[field], b[field]) * (dir === "desc" ? -1 : 1),
    );
  };
  const clone = (r: Row | undefined) => (r ? { ...r } : null);
  return {
    findFirst: async ({ where }: Row = {}) =>
      clone(rows().find((r) => matches(r, where))),
    findUnique: async ({ where }: Row) =>
      clone(rows().find((r) => matches(r, where))),
    findMany: async ({ where, orderBy, skip = 0, take }: Row = {}) =>
      sort(
        rows().filter((r) => matches(r, where)),
        orderBy,
      )
        .slice(skip, take === undefined ? undefined : skip + take)
        .map((r) => ({ ...r })),
    count: async ({ where }: Row = {}) =>
      rows().filter((r) => matches(r, where)).length,
    create: async ({ data }: Row) => {
      const row: Row = {
        ...(DEFAULTS[name]?.() ?? {}),
        id: newId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apply(row, data, name);
      rows().push(row);
      return { ...row };
    },
    update: async ({ where, data }: Row) => {
      const row = rows().find((r) => matches(r, where));
      if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
      apply(row, data, name);
      return { ...row };
    },
    updateMany: async ({ where, data }: Row) => {
      const hit = rows().filter((r) => matches(r, where));
      hit.forEach((r) => apply(r, data, name));
      return { count: hit.length };
    },
  };
}

const MODELS = [
  "user",
  "tenant",
  "supportTicket",
  "supportMessage",
  "supportAttachment",
  "supportActivity",
  "tenantMembership",
];

export const fakeDb: any = {
  async $transaction(fn: (tx: any) => Promise<unknown>) {
    const snapshot = structuredClone(tables);
    try {
      return await fn(fakeDb);
    } catch (err) {
      tables = snapshot;
      throw err;
    }
  },
  // The ticket counter's findAndModify ($inc, upsert, new).
  async $runCommandRaw(cmd: Row) {
    if (cmd.findAndModify !== "support_counters")
      throw new Error("fakeDb: unsupported command");
    const list = (tables.supportCounter ??= []);
    let doc = list.find((d) => d.key === cmd.query.key);
    if (!doc) list.push((doc = { key: cmd.query.key, seq: 0 }));
    doc.seq += cmd.update.$inc.seq;
    return { ok: 1, value: { ...doc } };
  },
};
for (const m of MODELS) {
  Object.defineProperty(fakeDb, m, { get: () => model(m), enumerable: true });
}

export function resetFakeDb(seed: Partial<Tables> = {}) {
  tables = structuredClone(seed) as Tables;
  idSeq = 1000;
}

export const table = (name: string): Row[] => (tables[name] ??= []);
