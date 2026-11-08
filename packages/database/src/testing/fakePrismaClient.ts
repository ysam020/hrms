/**
 * In-memory stand-in for PrismaClient, so tests can run @hrms/db's real
 * tenant routing — runWithTenant, the prismaWithTenant proxy, the tenant
 * filter on master `user` queries, the tenant client pool, runForTenant —
 * against separate "databases" without a MongoDB server.
 *
 * Every client is bound to the database named in its datasourceUrl (the
 * master client has none, so it is "master"); clients for the same name
 * share rows. Install it in a test file with:
 *
 *   jest.mock("@prisma/client", () => require("@hrms/db/testing").prismaClientModule);
 *
 * Supports the query shapes the background jobs use, not all of Prisma.
 */

type Row = Record<string, any>;

const databases = new Map<string, Map<string, Row[]>>();
let idCounter = 0;

export const MASTER_DB = "master";

function table(db: string, model: string): Row[] {
  if (!databases.has(db)) databases.set(db, new Map());
  const tables = databases.get(db)!;
  if (!tables.has(model)) tables.set(model, []);
  return tables.get(model)!;
}

/** Replaces the rows of the given models in `db`. */
export function seedDatabase(db: string, data: Record<string, Row[]>): void {
  for (const [model, rows] of Object.entries(data)) {
    const t = table(db, model);
    t.splice(0, t.length, ...rows.map((r) => ({ ...r })));
  }
}

/** Current rows of `model` in `db` (copies). */
export function readTable(db: string, model: string): Row[] {
  return table(db, model).map((r) => ({ ...r }));
}

export function resetDatabases(): void {
  databases.clear();
  idCounter = 0;
}

export function newObjectId(): string {
  idCounter += 1;
  return idCounter.toString(16).padStart(24, "f");
}

function dbNameFromUrl(url: string | undefined): string {
  if (!url) return MASTER_DB;
  const m = url.match(/\/([^/?]+)(\?|$)/);
  return m ? m[1] : MASTER_DB;
}

const comparable = (v: unknown) => (v instanceof Date ? v.getTime() : v);

function isOperatorObject(v: unknown): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === "object" &&
    !(v instanceof Date) &&
    !Array.isArray(v) &&
    Object.keys(v).some((k) =>
      ["in", "notIn", "lt", "lte", "gt", "gte", "not", "equals"].includes(k),
    )
  );
}

function matchesValue(actual: unknown, cond: unknown): boolean {
  if (!isOperatorObject(cond)) {
    return comparable(actual) === comparable(cond);
  }
  const a = comparable(actual) as any;
  for (const [op, raw] of Object.entries(cond)) {
    const v = comparable(raw) as any;
    if (op === "in" && !(raw as unknown[]).map(comparable).includes(a))
      return false;
    if (op === "notIn" && (raw as unknown[]).map(comparable).includes(a))
      return false;
    if (op === "lt" && !(a < v)) return false;
    if (op === "lte" && !(a <= v)) return false;
    if (op === "gt" && !(a > v)) return false;
    if (op === "gte" && !(a >= v)) return false;
    if (op === "equals" && a !== v) return false;
    if (op === "not") {
      if (raw === null ? actual === null || actual === undefined : a === v)
        return false;
    }
  }
  return true;
}

export function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === "OR") return (cond as Row[]).some((c) => matchesWhere(row, c));
    if (key === "AND")
      return (cond as Row[]).every((c) => matchesWhere(row, c));
    if (key === "NOT") {
      const list = Array.isArray(cond) ? cond : [cond];
      return list.every((c) => !matchesWhere(row, c));
    }
    return matchesValue(row[key], cond);
  });
}

function project(row: Row, select: Row | undefined): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [k, v] of Object.entries(select)) if (v) out[k] = row[k];
  return out;
}

class FakeModel {
  constructor(
    private readonly db: string,
    private readonly model: string,
  ) {}

  private rows(): Row[] {
    return table(this.db, this.model);
  }

  async findMany(args: Row = {}): Promise<Row[]> {
    let rows = this.rows().filter((r) => matchesWhere(r, args.where));
    if (args.skip) rows = rows.slice(args.skip);
    if (args.take) rows = rows.slice(0, args.take);
    return rows.map((r) => project(r, args.select));
  }

  async findFirst(args: Row = {}): Promise<Row | null> {
    return (await this.findMany({ ...args, take: 1 }))[0] ?? null;
  }

  async findUnique(args: Row): Promise<Row | null> {
    return this.findFirst(args);
  }

  async count(args: Row = {}): Promise<number> {
    return this.rows().filter((r) => matchesWhere(r, args.where)).length;
  }

  async create(args: Row): Promise<Row> {
    const row = { id: newObjectId(), ...args.data };
    this.rows().push(row);
    return project(row, args.select);
  }

  async update(args: Row): Promise<Row> {
    const row = this.rows().find((r) => matchesWhere(r, args.where));
    if (!row) {
      const err: any = new Error(`${this.model} record not found`);
      err.code = "P2025";
      throw err;
    }
    Object.assign(row, args.data);
    return project(row, args.select);
  }

  async updateMany(args: Row): Promise<{ count: number }> {
    const rows = this.rows().filter((r) => matchesWhere(r, args.where));
    for (const row of rows) Object.assign(row, args.data);
    return { count: rows.length };
  }
}

const MODEL_OPERATIONS = [
  "findMany",
  "findFirst",
  "findUnique",
  "count",
  "create",
  "update",
  "updateMany",
];

export class FakePrismaClient {
  readonly __db: string;

  constructor(options: { datasourceUrl?: string } = {}) {
    this.__db = dbNameFromUrl(options.datasourceUrl);
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop !== "string" || prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        return new FakeModel(target.__db, prop);
      },
    });
  }

  $use(): void {}
  $on(): void {}
  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
  async $runCommandRaw(): Promise<Row> {
    return {};
  }

  async $transaction(arg: unknown): Promise<unknown> {
    return Array.isArray(arg) ? Promise.all(arg) : (arg as any)(this);
  }

  // Supports `$extends({ query: { <model>: { $allOperations } } })`, the
  // form prismaWithTenant uses to inject tenantId into user queries.
  $extends(extension: Row): unknown {
    const hooks = extension.query ?? {};
    const self = this as any;
    return new Proxy(self, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        const hook = typeof prop === "string" && hooks[prop]?.$allOperations;
        if (!hook) return value;
        const wrapped: Row = {};
        for (const operation of MODEL_OPERATIONS) {
          wrapped[operation] = (args: Row) =>
            hook({
              model: prop,
              operation,
              args: args ?? {},
              query: (a: Row) => value[operation](a),
            });
        }
        return wrapped;
      },
    });
  }
}

/** Module shape to return from `jest.mock("@prisma/client", ...)`. */
export const prismaClientModule = {
  PrismaClient: FakePrismaClient,
  Prisma: {},
};
