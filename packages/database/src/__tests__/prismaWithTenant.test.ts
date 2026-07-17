const READ_METHODS = [
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
];
const ALL_USER_METHODS = [
  ...READ_METHODS,
  "create",
  "createMany",
  "update",
  "upsert",
  "delete",
];

function makeModel(methods: string[]) {
  const model: Record<string, jest.Mock> = {};
  for (const m of methods)
    model[m] = jest.fn().mockResolvedValue({ __result: m });
  return model;
}

// Minimal fake of Prisma's client-extension mechanism (`$extends`), just
// enough to exercise the `query.user.$allOperations` hook that
// prismaWithTenant.ts installs — real prisma.$extends does much more, but
// this is the only piece prismaWithTenant.ts's logic depends on.
function makeFakePrisma() {
  const base: any = {
    user: makeModel(ALL_USER_METHODS),
    tenant: makeModel(["findMany", "findUnique"]),
    tenantMembership: makeModel(["findMany", "findUnique"]),
    payoutTenantIndex: makeModel(["findFirst"]),
    employee: makeModel(["findMany", "create"]),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn().mockResolvedValue("base-transaction-result"),
  };
  base.$extends = jest.fn((config: any) => {
    const extended: any = { ...base };
    for (const modelName of Object.keys(config.query)) {
      const hooks = config.query[modelName];
      const original = base[modelName];
      const wrapped: Record<string, any> = {};
      for (const method of Object.keys(original)) {
        wrapped[method] = (args: any) =>
          hooks.$allOperations({
            operation: method,
            args,
            query: (finalArgs: any) => original[method](finalArgs),
          });
      }
      extended[modelName] = wrapped;
    }
    return extended;
  });
  return base;
}

let fakePrisma: any;

// jest.doMock (inside beforeEach, after jest.resetModules()) rather than a
// hoisted jest.mock, so each test gets a fresh fake prisma instance instead
// of one shared mock object across the whole file.
describe("prismaWithTenant", () => {
  let getTenantId: jest.Mock;
  let getTenantClient: jest.Mock;
  let prismaWithTenant: any;

  beforeEach(() => {
    jest.resetModules();
    fakePrisma = makeFakePrisma();
    getTenantId = jest.fn().mockReturnValue(undefined);
    getTenantClient = jest.fn().mockReturnValue(null);

    jest.doMock("../prismaClient", () => ({ prisma: fakePrisma }));
    jest.doMock("../tenantContext", () => ({
      getTenantId: (...args: unknown[]) => getTenantId(...args),
      getTenantClient: (...args: unknown[]) => getTenantClient(...args),
    }));

    prismaWithTenant = require("../prismaWithTenant").prismaWithTenant;
  });

  describe("$-prefixed client methods", () => {
    it("routes to the base master client when no tenant client is bound", async () => {
      getTenantClient.mockReturnValue(null);
      const result = await prismaWithTenant.$transaction("op");
      expect(fakePrisma.$transaction).toHaveBeenCalledWith("op");
      expect(result).toBe("base-transaction-result");
    });

    it("routes to the bound tenant client when one is present", async () => {
      const tenantClient = {
        $transaction: jest.fn().mockResolvedValue("tenant-transaction-result"),
      };
      getTenantClient.mockReturnValue(tenantClient);

      const result = await prismaWithTenant.$transaction("op");

      expect(tenantClient.$transaction).toHaveBeenCalledWith("op");
      expect(fakePrisma.$transaction).not.toHaveBeenCalled();
      expect(result).toBe("tenant-transaction-result");
    });
  });

  describe("user model (master DB, tenantId auto-injected)", () => {
    it("injects tenantId into the where clause for read actions", async () => {
      getTenantId.mockReturnValue("t1");
      await prismaWithTenant.user.findMany({ where: { name: "alice" } });
      expect(fakePrisma.user.findMany).toHaveBeenCalledWith({
        where: { name: "alice", tenantId: "t1" },
      });
    });

    it("does not inject tenantId when there is no tenant context", async () => {
      getTenantId.mockReturnValue(undefined);
      await prismaWithTenant.user.findMany({ where: { name: "alice" } });
      expect(fakePrisma.user.findMany).toHaveBeenCalledWith({
        where: { name: "alice" },
      });
    });

    it("injects tenantId into data for create", async () => {
      getTenantId.mockReturnValue("t1");
      await prismaWithTenant.user.create({ data: { name: "bob" } });
      expect(fakePrisma.user.create).toHaveBeenCalledWith({
        data: { name: "bob", tenantId: "t1" },
      });
    });

    it("injects tenantId into every row for createMany with an array payload", async () => {
      getTenantId.mockReturnValue("t1");
      await prismaWithTenant.user.createMany({
        data: [{ name: "a" }, { name: "b" }],
      });
      expect(fakePrisma.user.createMany).toHaveBeenCalledWith({
        data: [
          { name: "a", tenantId: "t1" },
          { name: "b", tenantId: "t1" },
        ],
      });
    });

    it("injects tenantId for createMany with a single-object payload", async () => {
      getTenantId.mockReturnValue("t1");
      await prismaWithTenant.user.createMany({ data: { name: "solo" } });
      expect(fakePrisma.user.createMany).toHaveBeenCalledWith({
        data: { name: "solo", tenantId: "t1" },
      });
    });

    it("injects tenantId into where for update/upsert/delete", async () => {
      getTenantId.mockReturnValue("t1");

      await prismaWithTenant.user.update({
        where: { id: "u1" },
        data: { name: "x" },
      });
      expect(fakePrisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1", tenantId: "t1" },
        data: { name: "x" },
      });

      await prismaWithTenant.user.delete({ where: { id: "u1" } });
      expect(fakePrisma.user.delete).toHaveBeenCalledWith({
        where: { id: "u1", tenantId: "t1" },
      });

      await prismaWithTenant.user.upsert({
        where: { id: "u1" },
        create: {},
        update: {},
      });
      expect(fakePrisma.user.upsert).toHaveBeenCalledWith({
        where: { id: "u1", tenantId: "t1" },
        create: {},
        update: {},
      });
    });
  });

  describe("other master models (no filter injection)", () => {
    it.each(["tenant", "tenantMembership"])(
      "routes %s straight to the master client with no tenantId filter",
      async (modelName) => {
        getTenantId.mockReturnValue("t1");
        await prismaWithTenant[modelName].findMany({ where: { active: true } });
        expect(fakePrisma[modelName].findMany).toHaveBeenCalledWith({
          where: { active: true },
        });
      },
    );

    it("routes payoutTenantIndex to the master client even with no tenant context (unauthenticated webhooks)", async () => {
      getTenantId.mockReturnValue(undefined);
      await prismaWithTenant.payoutTenantIndex.findFirst({
        where: { payoutId: "p1" },
      });
      expect(fakePrisma.payoutTenantIndex.findFirst).toHaveBeenCalledWith({
        where: { payoutId: "p1" },
      });
    });
  });

  describe("business models (tenant-specific DB)", () => {
    it("routes to the bound tenant-specific client", async () => {
      const tenantClient = { employee: makeModel(["findMany"]) };
      getTenantClient.mockReturnValue(tenantClient);

      await prismaWithTenant.employee.findMany({ where: {} });

      expect(tenantClient.employee.findMany).toHaveBeenCalledWith({
        where: {},
      });
      expect(fakePrisma.employee.findMany).not.toHaveBeenCalled();
    });

    it("throws when no tenant-specific client is bound, refusing to fall back to the master DB", () => {
      getTenantClient.mockReturnValue(null);
      expect(() => prismaWithTenant.employee).toThrow(
        /no tenant-specific DB client bound/,
      );
    });
  });
});
