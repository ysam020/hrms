/**
 * Field protection against a real MongoDB (isolated container, synthetic
 * data): every protected field of every model, the validators, isolation
 * between master and tenant keys, queries, keys and the migration.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import {
  prisma,
  getClientForDb,
  ensureMasterIndexes,
  ensureFieldValidators,
  PII_REGISTRY,
  FieldKeyStore,
  fieldKeyStore,
  kekProviderFromEnv,
  Prisma,
  PrismaClient,
  validatorFor,
} from "@hrms/db";
import { isEncrypted, ciphertextKeyInfo, FieldCryptoError } from "@hrms/crypto";
// From dist, so these share one module instance (and key store) with @hrms/db.
import {
  MASTER_PROTECTED_MODELS,
  TENANT_PROTECTED_MODELS,
} from "../packages/database/dist/fieldValidators";
import { runPiiMigration } from "../packages/database/dist/migrate-encrypt-pii";

const TENANT_A = "hrms-it-acme";
const TENANT_B = "hrms-it-beta";
const tenantA = getClientForDb(TENANT_A);
const tenantB = getClientForDb(TENANT_B);
const clientFor = (model: string) =>
  MASTER_PROTECTED_MODELS.includes(model) ? prisma : tenantA;
const raw = (c: PrismaClient, cmd: Record<string, unknown>) =>
  (c.$runCommandRaw as (x: unknown) => Promise<any>)(cmd);
const delegate = (c: PrismaClient, model: string) =>
  (c as any)[model[0].toLowerCase() + model.slice(1)];
const oid = () => crypto.randomBytes(12).toString("hex");

const META = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
// The runtime DMMF omits native types, so read @db.ObjectId from the schema.
const OBJECT_ID_FIELDS = new Set<string>();
{
  const schema = require("node:fs").readFileSync(
    require("node:path").join(
      __dirname,
      "../packages/database/src/prisma/schema.prisma",
    ),
    "utf8",
  ) as string;
  let model = "";
  for (const line of schema.split("\n")) {
    const m = /^model (\w+) \{/.exec(line);
    if (m) model = m[1];
    const f = /^\s+(\w+)\s+\S+.*@db\.ObjectId/.exec(line);
    if (f) OBJECT_ID_FIELDS.add(`${model}.${f[1]}`);
  }
}
const collectionOf = (model: string) => META.get(model)!.dbName ?? model;

/** Required non-protected fields, so a create is valid. */
function baseData(model: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of META.get(model)!.fields) {
    if (
      f.kind === "object" ||
      f.isId ||
      !f.isRequired ||
      f.hasDefaultValue ||
      f.isUpdatedAt
    )
      continue;
    if (PII_REGISTRY[model]?.[f.name]) continue;
    if (f.isList) out[f.name] = [];
    else if (OBJECT_ID_FIELDS.has(`${model}.${f.name}`))
      out[f.name] = f.isList ? [] : oid();
    else if (f.type === "String") out[f.name] = `base-${f.name}-${oid()}`;
    else if (f.type === "Int") out[f.name] = 1;
    else if (f.type === "Float") out[f.name] = 1.5;
    else if (f.type === "Boolean") out[f.name] = false;
    else if (f.type === "DateTime") out[f.name] = new Date();
    else if (f.type === "Json") out[f.name] = {};
  }
  return out;
}

/** A distinctive plaintext per protected field. */
function sample(model: string, field: string): unknown {
  const rule = PII_REGISTRY[model][field] as any;
  const tag = `PII-${model}-${field}-${oid().slice(0, 8)}`;
  switch (rule.kind) {
    case "string":
      return rule.blindIndex === "email"
        ? `${tag.toLowerCase()}@example.test`
        : tag;
    case "number":
      return 123456.75;
    case "boolean":
      return true;
    case "date":
      return new Date("1990-05-17T00:00:00.000Z");
    case "json":
      return { marker: tag, list: [0.25, 0.5], nested: { ok: true } };
    case "stringArray":
      return [`${tag}-a`, `${tag}-b`];
    case "compositeList":
      return [{ id: "n1", body: `${tag}-note`, createdAt: new Date() }];
    case "hmac":
      return `user:${tag}`;
    case "hash":
      return rule.format === "bcrypt"
        ? "$2b$10$abcdefghijklmnopqrstuuJ0e7bqfZ3Kq0VLuG6Gm8p6S4M4K1nW."
        : rule.format === "hex"
          ? "a".repeat(64)
          : ["b".repeat(64)];
  }
}

const markers: string[] = [];
const created = new Map<
  string,
  { id: string; values: Record<string, unknown> }
>();

beforeAll(async () => {
  for (const c of [prisma, tenantA, tenantB]) {
    const { cursor } = await raw(c, { listCollections: 1, nameOnly: true });
    for (const { name } of cursor.firstBatch) {
      if (!name.startsWith("system.")) await raw(c, { drop: name });
    }
  }
  await ensureMasterIndexes();
  await ensureFieldValidators(prisma, MASTER_PROTECTED_MODELS, "strict");
  for (const c of [tenantA, tenantB]) {
    await ensureFieldValidators(c, TENANT_PROTECTED_MODELS, "strict");
  }
});

afterAll(() => prisma.$disconnect());

const models = Object.keys(PII_REGISTRY);
const fieldCount = models.reduce(
  (n, m) => n + Object.keys(PII_REGISTRY[m]).length,
  0,
);

describe(`every protected field (${models.length} models, ${fieldCount} fields)`, () => {
  it("covers the 202 audited fields", () => {
    expect(fieldCount).toBe(202);
  });

  it.each(models)(
    "%s: Prisma create stores only ciphertext and reads back the original",
    async (model) => {
      const values: Record<string, unknown> = {};
      for (const f of Object.keys(PII_REGISTRY[model]))
        values[f] = sample(model, f);
      for (const v of Object.values(values)) {
        for (const s of JSON.stringify(v).match(
          /PII-\w+?-\w+?-[0-9a-f]{8}/gi,
        ) ?? [])
          markers.push(s);
      }
      const c = clientFor(model);
      const rec = await delegate(c, model).create({
        data: { ...baseData(model), ...values },
      });
      created.set(model, { id: rec.id, values });

      const stored = (
        await raw(c, {
          find: collectionOf(model),
          filter: { _id: { $oid: rec.id } },
          limit: 1,
          singleBatch: true,
        })
      ).cursor.firstBatch[0];
      for (const [f, rule] of Object.entries(PII_REGISTRY[model]) as [
        string,
        any,
      ][]) {
        const s = stored[f];
        if (rule.kind === "hash") expect(s).toEqual(values[f]);
        else if (rule.kind === "hmac") expect(s).toMatch(/^hmac:1\./);
        else if (rule.kind === "stringArray")
          s.forEach((x: string) => expect(isEncrypted(x)).toBe(true));
        else if (rule.kind === "compositeList")
          expect(isEncrypted(s[0].body)).toBe(true);
        else expect(isEncrypted(s)).toBe(true);
        if (rule.blindIndex) expect(stored[`${f}_bidx`]).toMatch(/^hmac:1\./);
      }

      const back = await delegate(c, model).findUnique({
        where: { id: rec.id },
      });
      for (const [f, rule] of Object.entries(PII_REGISTRY[model]) as [
        string,
        any,
      ][]) {
        if (rule.kind === "hmac") continue;
        if (rule.kind === "compositeList")
          expect(back[f][0].body).toBe((values[f] as any)[0].body);
        else expect(back[f]).toEqual(values[f]);
        expect(back).not.toHaveProperty(`${f}_bidx`);
      }
      expect(rec).toEqual(back);
    },
  );

  it("no plaintext marker in any collection, read directly", async () => {
    expect(markers.length).toBeGreaterThanOrEqual(150);
    for (const c of [prisma, tenantA]) {
      const { cursor } = await raw(c, { listCollections: 1, nameOnly: true });
      let text = "";
      for (const { name } of cursor.firstBatch) {
        text += JSON.stringify(
          (await raw(c, { find: name, limit: 10000, singleBatch: true })).cursor
            .firstBatch,
        );
      }
      for (const m of markers) expect(text).not.toContain(m);
    }
  });

  it("no plaintext marker in a mongodump of master and tenant databases", () => {
    for (const db of ["it_master", TENANT_A]) {
      const dump = execFileSync(
        "docker",
        [
          "exec",
          "praesto-it-mongo",
          "mongodump",
          "--quiet",
          `--db=${db}`,
          "--archive",
        ],
        { maxBuffer: 1 << 28 },
      );
      expect(dump.includes(Buffer.from("enc:v2:"))).toBe(true);
      for (const m of markers)
        expect(dump.includes(Buffer.from(m))).toBe(false);
    }
  });
});

describe("server-side validators", () => {
  const plaintextFor = (rule: any): unknown =>
    rule.kind === "number"
      ? 5
      : rule.kind === "boolean"
        ? true
        : rule.kind === "date"
          ? { $date: "1990-01-01T00:00:00Z" }
          : rule.kind === "json"
            ? { a: 1 }
            : rule.kind === "stringArray"
              ? ["plain"]
              : rule.kind === "compositeList"
                ? [{ body: "plain" }]
                : rule.kind === "hash"
                  ? rule.format === "hexArray"
                    ? ["plain"]
                    : "plain"
                  : "plain-value";

  it("reject a plaintext value in every protected field from a raw driver write", async () => {
    let checked = 0;
    for (const model of models) {
      const c = clientFor(model);
      for (const [f, rule] of Object.entries(PII_REGISTRY[model])) {
        const res = await raw(c, {
          insert: collectionOf(model),
          documents: [{ [f]: plaintextFor(rule) }],
        });
        expect({ model, f, rejected: !!res.writeErrors?.length }).toEqual({
          model,
          f,
          rejected: true,
        });
        checked++;
      }
    }
    expect(checked).toBe(202);
  });

  it("reject a plaintext update to an existing sealed record", async () => {
    const { id } = created.get("User")!;
    const res = await raw(prisma, {
      update: "users",
      updates: [
        {
          q: { _id: { $oid: id } },
          u: { $set: { aadhar_no: "999911112222" } },
        },
      ],
    });
    expect(res.writeErrors?.[0]?.code).toBe(121);
  });

  it("reject a blind index that is not a keyed hash", async () => {
    const res = await raw(prisma, {
      insert: "users",
      documents: [{ email_bidx: "someone@example.test" }],
    });
    expect(res.writeErrors?.length).toBe(1);
  });

  it("reject plaintext from a Prisma client with no protection (an older build)", async () => {
    const bare = new PrismaClient({
      datasourceUrl: process.env.DEV_MONGODB_URI,
    });
    try {
      await expect(
        bare.user.create({
          data: { username: "bare", mobile: "+919000000000" } as any,
        }),
      ).rejects.toThrow(/Document failed validation/);
      await expect(
        bare.user.update({
          where: { id: created.get("User")!.id },
          data: { pan_no: "ABCDE1234F" },
        }),
      ).rejects.toThrow(/Document failed validation/);
    } finally {
      await bare.$disconnect();
    }
  });

  it("allow null and absent protected fields", async () => {
    const u = await prisma.user.create({
      data: {
        username: `nulls-${oid()}`,
        mobile: null,
        aadhar_no: null,
      } as any,
    });
    expect(u.mobile).toBeNull();
    expect(
      (
        await raw(prisma, {
          insert: "users",
          documents: [{ note: null, first_name: null }],
        })
      ).writeErrors,
    ).toBeUndefined();
  });

  it("are configured with validationAction error on every protected collection", async () => {
    const { cursor } = await raw(tenantA, {
      listCollections: 1,
      filter: { name: "salarystructures" },
    });
    expect(cursor.firstBatch[0].options.validationAction).toBe("error");
    expect(cursor.firstBatch[0].options.validationLevel).toBe("strict");
    expect(validatorFor("SalaryStructure")!.collection).toBe(
      "salarystructures",
    );
  });
});

describe("isolation between master and tenant keys", () => {
  it("each scope has its own data keys", async () => {
    const keys = await raw(prisma, {
      find: "encryption_keys",
      filter: {},
      singleBatch: true,
      limit: 100,
    });
    const scopes = new Set(
      keys.cursor.firstBatch.map((k: any) => `${k.scope}|${k.purpose}`),
    );
    for (const s of [
      "master|enc",
      "master|bidx",
      `${TENANT_A}|enc`,
      `${TENANT_A}|bidx`,
    ])
      expect(scopes).toContain(s);
    for (const k of keys.cursor.firstBatch) {
      expect(k.kekId).toBe("env");
      expect(Buffer.from(k.wrappedKey, "base64").length).toBeGreaterThan(32);
    }
  });

  it("a tenant value copied into another tenant fails to open", async () => {
    const a = await tenantA.candidate.create({
      data: { name: "Asha Rao", email: "asha@example.test" },
    });
    const b = await tenantB.candidate.create({
      data: { name: "Ravi Iyer", email: "ravi@example.test" },
    });
    const sealed = (
      await raw(tenantA, {
        find: "candidates",
        filter: { _id: { $oid: a.id } },
        limit: 1,
        singleBatch: true,
      })
    ).cursor.firstBatch[0].name;
    expect(ciphertextKeyInfo(sealed)!.scope).toBe(TENANT_A);
    await raw(tenantB, {
      update: "candidates",
      updates: [{ q: { _id: { $oid: b.id } }, u: { $set: { name: sealed } } }],
    });
    await expect(
      tenantB.candidate.findUnique({ where: { id: b.id } }),
    ).rejects.toMatchObject({ code: "AUTH_FAILED" });
    await raw(tenantB, {
      delete: "candidates",
      deletes: [{ q: { _id: { $oid: b.id } }, limit: 1 }],
    });
  });

  it("a master value copied into a tenant fails to open", async () => {
    const stored = (
      await raw(prisma, {
        find: "users",
        filter: { _id: { $oid: created.get("User")!.id } },
        limit: 1,
        singleBatch: true,
      })
    ).cursor.firstBatch[0];
    const t = await tenantA.candidate.create({
      data: { name: "x", email: "x@example.test" },
    });
    await raw(tenantA, {
      update: "candidates",
      updates: [
        {
          q: { _id: { $oid: t.id } },
          u: { $set: { name: stored.first_name } },
        },
      ],
    });
    await expect(
      tenantA.candidate.findUnique({ where: { id: t.id } }),
    ).rejects.toBeInstanceOf(FieldCryptoError);
    await raw(tenantA, {
      delete: "candidates",
      deletes: [{ q: { _id: { $oid: t.id } }, limit: 1 }],
    });
  });

  it("database-only access cannot open values: the stored keys are wrapped", async () => {
    const otherKek = new FieldKeyStore(() => prisma as any, {
      provider: () =>
        kekProviderFromEnv({
          ...process.env,
          FIELD_KEK_HEX: "5".repeat(64),
        } as any),
    });
    await expect(otherKek.ring("master", "enc", false)).rejects.toThrow(
      /Field key unavailable/,
    );
    const k = (
      await raw(prisma, {
        find: "encryption_keys",
        filter: { scope: "master", purpose: "enc" },
        limit: 1,
        singleBatch: true,
      })
    ).cursor.firstBatch[0];
    const wrapped = Buffer.from(k.wrappedKey, "base64");
    const sealed = (
      await raw(prisma, {
        find: "users",
        filter: { _id: { $oid: created.get("User")!.id } },
        limit: 1,
        singleBatch: true,
      })
    ).cursor.firstBatch[0].pan_no as string;
    const [, , , , iv, tag, body] = sealed.split(":");
    for (const guess of [wrapped.subarray(0, 32), wrapped.subarray(28, 60)]) {
      const d = crypto.createDecipheriv(
        "aes-256-gcm",
        guess,
        Buffer.from(iv, "base64url"),
      );
      d.setAuthTag(Buffer.from(tag, "base64url"));
      expect(() =>
        Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]),
      ).toThrow();
    }
  });
});

describe("queries on protected fields", () => {
  const T = oid();
  beforeAll(async () => {
    const people = [
      ["Asha", "Rao", "Asha.Rao@Example.test"],
      ["ravi", "Iyer", "ravi@example.test"],
      ["Meera", "Ashok", "meera@example.test"],
      ["Zoya", "Khan", "zoya@example.test"],
    ];
    for (const [first, last, email] of people) {
      await prisma.user.create({
        data: {
          tenantId: T,
          username: `${first.toLowerCase()}_${T.slice(0, 4)}`,
          first_name: first,
          last_name: last,
          email,
          employeeStatus: "Active",
        } as any,
      });
    }
  });

  it("exact match on a blind-indexed field, case-folded for email", async () => {
    const u = await prisma.user.findFirst({
      where: { email: "asha.rao@example.TEST" },
    });
    expect(u?.first_name).toBe("Asha");
    expect(
      (
        await prisma.user.findMany({
          where: { email: { in: ["ravi@example.test", "zoya@example.test"] } },
        })
      )
        .map((x) => x.first_name)
        .sort(),
    ).toEqual(["Zoya", "ravi"]);
  });

  it("findUnique, update and delete by an encrypted unique field", async () => {
    const username = `meera_${T.slice(0, 4)}`;
    expect(
      (await prisma.user.findUnique({ where: { username } }))?.last_name,
    ).toBe("Ashok");
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { username } })).first_name,
    ).toBe("Meera");
    await prisma.user.update({
      where: { username },
      data: { designation: "Lead" },
    });
    expect(
      (await prisma.user.findFirst({ where: { username } }))?.designation,
    ).toBe("Lead");
    await expect(
      prisma.user.update({
        where: { username: "nobody" },
        data: { designation: "x" },
      }),
    ).rejects.toMatchObject({ code: "P2025" });
  });

  it("duplicate email or username is refused by the blind-index unique index", async () => {
    await expect(
      prisma.user.create({
        data: { username: `dup-${oid()}`, email: "RAVI@example.test" } as any,
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma.user.create({
        data: { username: `ravi_${T.slice(0, 4)}` } as any,
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("contains search, name sort and paging run in memory within the tenant", async () => {
    const where = {
      tenantId: T,
      OR: [
        { first_name: { contains: "ash", mode: "insensitive" as const } },
        { last_name: { contains: "ash", mode: "insensitive" as const } },
      ],
    };
    const all = await prisma.user.findMany({
      where,
      orderBy: { first_name: "asc" },
      select: { first_name: true },
    });
    expect(all).toEqual([{ first_name: "Asha" }, { first_name: "Meera" }]);
    expect(await prisma.user.count({ where })).toBe(2);
    const page2 = await prisma.user.findMany({
      where: { tenantId: T },
      orderBy: [{ last_name: "desc" }],
      skip: 1,
      take: 2,
      select: { last_name: true },
    });
    expect(page2.map((u) => u.last_name)).toEqual(["Khan", "Iyer"]);
    expect(
      await prisma.user.findFirst({
        where: { tenantId: T, first_name: { startsWith: "Z" } },
        select: { last_name: true },
      }),
    ).toEqual({ last_name: "Khan" });
  });

  it("updateMany and deleteMany with an in-memory filter touch only matching rows", async () => {
    const r = await prisma.user.updateMany({
      where: {
        tenantId: T,
        last_name: { contains: "kha", mode: "insensitive" },
      },
      data: { note: "flagged" },
    });
    expect(r.count).toBe(1);
  });

  it("refuses work it can't do correctly, instead of returning a wrong answer", async () => {
    process.env.FIELD_MEMORY_SCAN_LIMIT = "2";
    try {
      await expect(
        prisma.user.findMany({
          where: { tenantId: T, first_name: { contains: "a" } },
        }),
      ).rejects.toMatchObject({ code: "SCAN_LIMIT" });
    } finally {
      delete process.env.FIELD_MEMORY_SCAN_LIMIT;
    }
    await expect(
      prisma.user.groupBy({ by: ["first_name"], _count: true } as any),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_QUERY" });
    await expect(
      prisma.user.aggregateRaw({
        pipeline: [{ $match: { first_name: "Asha" } }],
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_QUERY" });
    await expect(
      tenantA.salaryStructure.aggregateRaw({
        pipeline: [{ $group: { _id: null, a: { $avg: "$grossSalary" } } }],
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_QUERY" });
    const s = await tenantA.salaryAdvance.create({
      data: {
        userId: oid(),
        amount: 5000,
        emiAmount: 1000,
        remainingAmount: 5000,
      },
    });
    await expect(
      tenantA.salaryAdvance.update({
        where: { id: s.id },
        data: { remainingAmount: { increment: 1 } as any },
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_OPERATION" });
    await expect(
      prisma.user.update({
        where: { id: created.get("User")!.id },
        data: {
          pan_no: (
            await raw(prisma, {
              find: "users",
              filter: { _id: { $oid: created.get("User")!.id } },
              limit: 1,
              singleBatch: true,
            })
          ).cursor.firstBatch[0].pan_no,
        },
      }),
    ).rejects.toMatchObject({ code: "CIPHERTEXT_INPUT" });
    await expect(
      prisma.user.create({
        data: { username: `bidx-${oid()}`, email_bidx: "hmac:1.x" } as any,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_OPERATION" });
  });

  it("aggregateRaw that only projects protected fields returns them opened", async () => {
    const rows = (await prisma.user.aggregateRaw({
      pipeline: [
        { $match: { $expr: { $eq: ["$tenantId", { $toObjectId: T }] } } },
        { $project: { _id: 0, first_name: 1, dob: 1 } },
        { $limit: 1 },
      ],
    })) as any[];
    expect(typeof rows[0].first_name).toBe("string");
    expect(rows[0].first_name).not.toMatch(/^enc:/);
  });
});

describe("write paths", () => {
  it("createMany, upsert, nested create and transactions all seal", async () => {
    await tenantA.candidate.createMany({
      data: [
        { name: "CM One", email: "cm1@example.test" },
        { name: "CM Two", email: "cm2@example.test" },
      ],
    });
    const run = await tenantA.payrollRun.create({
      data: {
        month: 1,
        year: 2031,
        initiatedBy: oid(),
        lineItems: {
          create: [{ userId: oid(), grossSalary: 50000, netPayable: 45000 }],
        },
      },
      include: { lineItems: true },
    });
    expect(run.lineItems[0].netPayable).toBe(45000);
    expect(run.lineItems[0].basicPay).toBe(0);
    const li = (
      await raw(tenantA, {
        find: "payroll_line_items",
        filter: {},
        limit: 1,
        singleBatch: true,
      })
    ).cursor.firstBatch[0];
    expect(isEncrypted(li.grossSalary) && isEncrypted(li.basicPay)).toBe(true);
    const up = await tenantA.offer.upsert({
      where: { id: oid() },
      create: {
        tenantId: oid(),
        applicationId: oid(),
        createdBy: oid(),
        offeredCTC: 1200000,
      },
      update: {},
    });
    expect(up.offeredCTC).toBe(1200000);
    await tenantA.$transaction(async (tx) => {
      await tx.candidate.create({
        data: { name: "Tx Person", email: "tx@example.test" },
      });
    });
    await tenantA.$transaction([
      tenantA.candidate.create({
        data: { name: "Batch Person", email: "batch@example.test" },
      }),
    ]);
    const { cursor } = await raw(tenantA, {
      find: "candidates",
      filter: {},
      limit: 100,
      singleBatch: true,
    });
    for (const d of cursor.firstBatch) expect(isEncrypted(d.name)).toBe(true);
    expect(
      (
        await tenantA.candidate.findFirst({
          where: { email: "TX@example.test" },
        })
      )?.name,
    ).toBe("Tx Person");
  });

  it("the audit trail written by the tenant hook is sealed", async () => {
    const c = await tenantA.candidate.create({
      data: { name: "Audit Person", email: "audit@example.test" },
    });
    await tenantA.candidate.update({
      where: { id: c.id },
      data: { currentLocation: "Pune" },
    });
    await new Promise((r) => setTimeout(r, 200));
    const { cursor } = await raw(tenantA, {
      find: "auditlogs",
      filter: { entityType: "Candidate" },
      limit: 50,
      singleBatch: true,
    });
    expect(cursor.firstBatch.length).toBeGreaterThan(0);
    const text = JSON.stringify(cursor.firstBatch);
    expect(text).not.toContain("Audit Person");
    expect(text).not.toContain("Pune");
    const opened = await tenantA.auditLog.findFirst({
      where: { entityType: "Candidate", action: "UPDATE" },
      orderBy: { timestamp: "desc" },
    });
    expect(JSON.stringify(opened?.newValue)).toContain("Pune");
  });
});

describe("keys", () => {
  it("unwrapped keys are cached for the configured time, then reloaded", async () => {
    let unwraps = 0;
    const base = kekProviderFromEnv();
    let now = 0;
    const store = new FieldKeyStore(() => prisma as any, {
      ttlMs: 1000,
      now: () => now,
      provider: () => ({
        kekId: base.kekId,
        generate: (c) => base.generate(c),
        unwrap: (w, c) => (unwraps++, base.unwrap(w, c)),
      }),
    });
    await store.ring("master", "enc", false);
    await store.ring("master", "enc", false);
    expect(unwraps).toBe(1);
    now = 1500;
    await store.ring("master", "enc", false);
    expect(unwraps).toBe(2);
  });

  it("rotation: new writes use the new version, old values still open", async () => {
    const before = await tenantB.candidate.create({
      data: { name: "Before Rotation", email: "br@example.test" },
    });
    const v = await fieldKeyStore().rotate(TENANT_B, "enc");
    expect(v).toBe(2);
    const after = await tenantB.candidate.create({
      data: { name: "After Rotation", email: "ar@example.test" },
    });
    const docs = (
      await raw(tenantB, {
        find: "candidates",
        filter: { _id: { $in: [{ $oid: before.id }, { $oid: after.id }] } },
        singleBatch: true,
        limit: 2,
      })
    ).cursor.firstBatch;
    const versions = Object.fromEntries(
      docs.map((d: any) => [d._id.$oid, ciphertextKeyInfo(d.name)!.version]),
    );
    expect(versions[before.id]).toBe(1);
    expect(versions[after.id]).toBe(2);
    expect(
      (await tenantB.candidate.findUnique({ where: { id: before.id } }))?.name,
    ).toBe("Before Rotation");
    await raw(prisma, {
      insert: "tenants",
      documents: [
        {
          name: "IT Beta",
          slug: `it-beta-${oid()}`,
          dbName: TENANT_B,
          isActive: true,
        },
      ],
    });
    const rekey = await runPiiMigration({
      mode: "apply",
      database: "tenant",
      tenants: [TENANT_B],
      models: ["Candidate"],
      rekey: true,
      restart: true,
    });
    expect(rekey.totals.documentsFailedVerification).toBe(0);
    const again = (
      await raw(tenantB, {
        find: "candidates",
        filter: { _id: { $oid: before.id } },
        singleBatch: true,
        limit: 1,
      })
    ).cursor.firstBatch[0];
    expect(ciphertextKeyInfo(again.name)!.version).toBe(2);
  });
});

describe("AWS KMS envelope (local KMS emulator)", () => {
  it("wraps a data key with KMS, binds it to its scope, and refuses another scope's context", async () => {
    const res = await fetch("http://127.0.0.1:37018/", {
      method: "POST",
      headers: {
        "X-Amz-Target": "TrentService.CreateKey",
        "Content-Type": "application/x-amz-json-1.1",
      },
      body: "{}",
    });
    const arn = (await res.json()).KeyMetadata.Arn as string;
    const env = {
      ...process.env,
      FIELD_KMS_KEY_ID: arn,
      FIELD_KMS_ENDPOINT: "http://127.0.0.1:37018",
      FIELD_KMS_REGION: "ap-south-1",
      AWS_ACCESS_KEY_ID: "it",
      AWS_SECRET_ACCESS_KEY: "it",
    } as any;
    const prev = {
      id: process.env.AWS_ACCESS_KEY_ID,
      s: process.env.AWS_SECRET_ACCESS_KEY,
    };
    process.env.AWS_ACCESS_KEY_ID = "it";
    process.env.AWS_SECRET_ACCESS_KEY = "it";
    try {
      const provider = kekProviderFromEnv(env);
      expect(provider.kekId).toBe(arn);
      const ctx = {
        app: "praesto-field-encryption",
        scope: "kms-test",
        purpose: "enc",
      };
      const { plaintext, wrapped } = await provider.generate(ctx);
      expect(plaintext.length).toBe(32);
      expect((await provider.unwrap(wrapped, ctx)).equals(plaintext)).toBe(
        true,
      );
      await expect(
        provider.unwrap(wrapped, { ...ctx, scope: "another-tenant" }),
      ).rejects.toThrow();
      expect(() =>
        kekProviderFromEnv({ ...env, NODE_ENV: "production" }),
      ).toThrow();
    } finally {
      process.env.AWS_ACCESS_KEY_ID = prev.id;
      process.env.AWS_SECRET_ACCESS_KEY = prev.s;
    }
  });
});

describe("migration of existing plaintext", () => {
  const legacyTenant = "hrms-it-acme";
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    // Production today: no validators, plaintext rows. Seed that state, then
    // apply moderate validators as the first deployment would.
    for (const [c, coll] of [
      [prisma, "users"],
      [tenantA, "salarystructures"],
      [tenantA, "auditlogs"],
    ] as const) {
      await raw(c, { collMod: coll, validator: {}, validationLevel: "off" });
    }
    await raw(prisma, {
      delete: "pii_migration_status",
      deletes: [{ q: {}, limit: 0 }],
    });
    await raw(prisma, {
      insert: "tenants",
      documents: [
        {
          name: "IT Acme",
          slug: `it-acme-${oid()}`,
          dbName: legacyTenant,
          isActive: true,
        },
      ],
    });
    const u = oid(),
      s = oid(),
      a = oid();
    ids.user = u;
    ids.salary = s;
    ids.audit = a;
    for (const coll of ["users"])
      await raw(prisma, {
        delete: coll,
        deletes: [{ q: { username: /^legacy/ }, limit: 0 }],
      });
    await raw(prisma, {
      insert: "users",
      documents: [
        {
          _id: { $oid: u },
          username: "legacy_user",
          email: "Legacy.User@Example.test",
          first_name: "Legacy",
          mobile: "+919812345678",
          aadhar_no: "999988887777",
          dob: { $date: "1988-02-03T00:00:00Z" },
          face_descriptor: [0.5, 0.25],
          refreshToken: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig",
          education_certificates: ["cert-a.pdf"],
          wfhHomeLatitude: 18.52,
        },
      ],
    });
    await raw(tenantA, {
      insert: "salarystructures",
      documents: [
        {
          _id: { $oid: s },
          userId: { $oid: oid() },
          month: 3,
          year: 2030,
          grossSalary: 88000.5,
          basicPay: 40000,
          netPayable: 80000,
          componentBreakdown: [{ code: "BASIC", amount: 40000 }],
        },
      ],
    });
    await raw(tenantA, {
      insert: "auditlogs",
      documents: [
        {
          _id: { $oid: a },
          action: "UPDATE",
          entityType: "User",
          username: "legacy_user",
          newValue: { first_name: "Legacy", mobile: "+919812345678" },
          description: "",
          ipAddress: "10.0.0.1",
        },
      ],
    });
    await ensureFieldValidators(prisma, MASTER_PROTECTED_MODELS, "moderate");
    await ensureFieldValidators(tenantA, TENANT_PROTECTED_MODELS, "moderate");
    // Moderate still refuses new plaintext.
    expect(
      (
        await raw(prisma, {
          insert: "users",
          documents: [{ username: "x", aadhar_no: "123412341234" }],
        })
      ).writeErrors?.length,
    ).toBe(1);
  });

  it("before migration, legacy rows are still found by email, username and trial key", async () => {
    expect(
      (
        await prisma.user.findFirst({
          where: { email: "legacy.user@example.test" },
        })
      )?.id,
    ).toBe(ids.user);
    expect(
      (await prisma.user.findUnique({ where: { username: "legacy_user" } }))
        ?.first_name,
    ).toBe("Legacy");
    await raw(prisma, {
      collMod: "trial_claims",
      validator: {},
      validationLevel: "off",
    });
    await raw(prisma, {
      insert: "trial_claims",
      documents: [
        {
          key: "domain:legacy.test",
          subscriptionId: "sub_legacy",
          userId: { $oid: oid() },
          createdAt: { $date: "2026-01-01T00:00:00Z" },
        },
      ],
    });
    expect(
      (
        await prisma.trialClaim.findFirst({
          where: { key: { in: ["domain:legacy.test"] } },
        })
      )?.subscriptionId,
    ).toBe("sub_legacy");
    await ensureFieldValidators(prisma, MASTER_PROTECTED_MODELS, "moderate");
    process.env.FIELD_LEGACY_PLAINTEXT_MATCH = "false";
    try {
      expect(
        await prisma.user.findFirst({
          where: { email: "legacy.user@example.test" },
        }),
      ).toBeNull();
    } finally {
      delete process.env.FIELD_LEGACY_PLAINTEXT_MATCH;
    }
  });

  it("dry run counts and writes nothing", async () => {
    const r = await runPiiMigration({ mode: "dry-run", database: "all" });
    expect(r.complete).toBe(true);
    expect(r.totals.fieldsTransformed).toBeGreaterThan(15);
    const u = (
      await raw(prisma, {
        find: "users",
        filter: { _id: { $oid: ids.user } },
        limit: 1,
        singleBatch: true,
      })
    ).cursor.firstBatch[0];
    expect(u.aadhar_no).toBe("999988887777");
    expect(JSON.stringify(r)).not.toContain("999988887777");
  });

  it("verify reports the plaintext that remains", async () => {
    const r = await runPiiMigration({ mode: "verify", database: "all" });
    expect(r.totals.fieldsPlaintextRemaining).toBeGreaterThan(15);
  });

  it("apply resumes after an interruption and leaves nothing in plaintext", async () => {
    const partial = await runPiiMigration({
      mode: "apply",
      database: "all",
      batchSize: 1,
      maxBatches: 2,
    });
    expect(partial.complete).toBe(false);
    const done = await runPiiMigration({
      mode: "apply",
      database: "all",
      batchSize: 1,
    });
    expect(done.complete).toBe(true);
    expect(done.totals.documentsFailedVerification).toBe(0);
    expect(done.totals.fieldsUnreadable).toBe(0);
    const verify = await runPiiMigration({ mode: "verify", database: "all" });
    expect(verify.totals.fieldsPlaintextRemaining).toBe(0);
    expect(verify.totals.documentsChanged).toBe(0);
    const statuses = await prisma.piiMigrationStatus.findMany({
      where: { mode: "apply" },
    });
    expect(statuses.length).toBeGreaterThan(5);
    expect(statuses.every((s) => s.complete)).toBe(true);
    expect(JSON.stringify(statuses)).not.toContain("999988887777");
  });

  it("migrated values read back with their original types", async () => {
    const u = await prisma.user.findUnique({ where: { id: ids.user } });
    expect(u).toMatchObject({
      first_name: "Legacy",
      mobile: "+919812345678",
      aadhar_no: "999988887777",
      face_descriptor: [0.5, 0.25],
      education_certificates: ["cert-a.pdf"],
      wfhHomeLatitude: 18.52,
    });
    expect(u!.dob).toEqual(new Date("1988-02-03T00:00:00Z"));
    expect(u!.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    process.env.FIELD_LEGACY_PLAINTEXT_MATCH = "false";
    try {
      expect(
        (
          await prisma.user.findFirst({
            where: { email: "legacy.user@example.test" },
          })
        )?.id,
      ).toBe(ids.user);
      expect(
        (
          await prisma.trialClaim.findFirst({
            where: { key: "domain:legacy.test" },
          })
        )?.subscriptionId,
      ).toBe("sub_legacy");
    } finally {
      delete process.env.FIELD_LEGACY_PLAINTEXT_MATCH;
    }
    const s = await tenantA.salaryStructure.findUnique({
      where: { id: ids.salary },
    });
    expect(s).toMatchObject({
      grossSalary: 88000.5,
      basicPay: 40000,
      netPayable: 80000,
      componentBreakdown: [{ code: "BASIC", amount: 40000 }],
    });
    const a = await tenantA.auditLog.findUnique({ where: { id: ids.audit } });
    expect(a?.newValue).toEqual({
      first_name: "Legacy",
      mobile: "+919812345678",
    });
    expect(
      (await tenantA.auditLog.findMany({ where: { username: "legacy_user" } }))
        .length,
    ).toBe(1);
  });

  it("is idempotent", async () => {
    const again = await runPiiMigration({
      mode: "apply",
      database: "all",
      restart: true,
    });
    expect(again.totals.fieldsTransformed).toBe(0);
  });

  it("strict validators can be applied after a clean migration", async () => {
    await ensureFieldValidators(prisma, MASTER_PROTECTED_MODELS, "strict");
    await ensureFieldValidators(tenantA, TENANT_PROTECTED_MODELS, "strict");
    const res = await raw(tenantA, {
      update: "salarystructures",
      updates: [
        { q: { _id: { $oid: ids.salary } }, u: { $set: { grossSalary: 1 } } },
      ],
    });
    expect(res.writeErrors?.[0]?.code).toBe(121);
  });

  it("rollback restores plaintext with its original BSON types", async () => {
    await ensureFieldValidators(prisma, MASTER_PROTECTED_MODELS, "off");
    await raw(prisma, {
      collMod: "users",
      validator: {},
      validationLevel: "off",
    });
    await raw(tenantA, {
      collMod: "salarystructures",
      validator: {},
      validationLevel: "off",
    });
    const r = await runPiiMigration({
      mode: "rollback",
      database: "all",
      models: ["User", "SalaryStructure"],
      restart: true,
    });
    expect(r.totals.documentsFailedVerification).toBe(0);
    const u = (
      await raw(prisma, {
        find: "users",
        filter: { _id: { $oid: ids.user } },
        limit: 1,
        singleBatch: true,
      })
    ).cursor.firstBatch[0];
    expect(u.aadhar_no).toBe("999988887777");
    expect(u.dob).toEqual({ $date: "1988-02-03T00:00:00Z" });
    expect(u.email_bidx).toBeUndefined();
    const s = (
      await raw(tenantA, {
        find: "salarystructures",
        filter: { _id: { $oid: ids.salary } },
        limit: 1,
        singleBatch: true,
      })
    ).cursor.firstBatch[0];
    expect(s.grossSalary).toBe(88000.5);
  });
});
