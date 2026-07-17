import { prismaWithTenant as prisma } from "@hrms/db";
import {
  listSalaryComponents,
  createSalaryComponent,
  updateSalaryComponent,
  deleteSalaryComponent,
  listPtSlabs,
  createPtSlab,
  updatePtSlab,
  deletePtSlab,
  listIncomeTaxSlabs,
  createIncomeTaxSlab,
  updateIncomeTaxSlab,
  deleteIncomeTaxSlab,
  listPayCycles,
  createPayCycle,
  updatePayCycle,
  deletePayCycle,
} from "../handlers/payrollComponents";

jest.mock("@hrms/db", () => {
  const _db: any = {
    salaryComponentDefinition: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    professionalTaxSlab: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    incomeTaxSlab: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    payCycle: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  return { prismaWithTenant: _db };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const db: any = prisma;

function makeReq(overrides: any = {}) {
  return {
    user: { userId: "u1", tenantId: "t1", tenantRole: "owner" },
    body: {},
    params: {},
    ...overrides,
  } as any;
}
function makeRes() {
  return { json: jest.fn() } as any;
}
const NON_OWNER = {
  user: { userId: "u1", tenantId: "t1", tenantRole: "member" },
};

describe("payrollComponents handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ permissions: [] });
  });

  describe("salary components", () => {
    it("returns FORBIDDEN without an active tenant", async () => {
      const req = makeReq({ user: { userId: "u1", tenantId: null } });
      const res = makeRes();
      await listSalaryComponents(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("seeds the six default components on first access, then returns them", async () => {
      db.salaryComponentDefinition.findFirst.mockResolvedValue(null);
      db.salaryComponentDefinition.upsert.mockResolvedValue({});
      db.salaryComponentDefinition.findMany.mockResolvedValue([
        { code: "BASIC" },
      ]);
      const req = makeReq();
      const res = makeRes();

      await listSalaryComponents(req, res);

      expect(db.salaryComponentDefinition.upsert).toHaveBeenCalledTimes(6);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: [{ code: "BASIC" }] }),
      );
    });

    it("does not reseed when components already exist for the tenant", async () => {
      db.salaryComponentDefinition.findFirst.mockResolvedValue({
        id: "existing",
      });
      db.salaryComponentDefinition.findMany.mockResolvedValue([]);
      const req = makeReq();
      const res = makeRes();

      await listSalaryComponents(req, res);

      expect(db.salaryComponentDefinition.upsert).not.toHaveBeenCalled();
    });

    it("rejects create for a non-privileged member", async () => {
      const req = makeReq(NON_OWNER);
      const res = makeRes();
      await createSalaryComponent(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
      expect(db.salaryComponentDefinition.create).not.toHaveBeenCalled();
    });

    it("uppercases the code on create", async () => {
      db.salaryComponentDefinition.create.mockResolvedValue({ code: "BONUS" });
      const req = makeReq({ body: { code: "bonus", name: "Bonus" } });
      const res = makeRes();
      await createSalaryComponent(req, res);
      expect(db.salaryComponentDefinition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ code: "BONUS", createdBy: "u1" }),
      });
    });

    it("returns NOT_FOUND updating a component that doesn't belong to the tenant", async () => {
      db.salaryComponentDefinition.findFirst.mockResolvedValue(null);
      const req = makeReq({ params: { id: "c1" }, body: { name: "X" } });
      const res = makeRes();
      await updateSalaryComponent(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("blocks deactivating a statutory component via update", async () => {
      db.salaryComponentDefinition.findFirst.mockResolvedValue({
        id: "c1",
        isStatutory: true,
      });
      const req = makeReq({ params: { id: "c1" }, body: { isActive: false } });
      const res = makeRes();
      await updateSalaryComponent(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("Statutory"),
        }),
      );
      expect(db.salaryComponentDefinition.update).not.toHaveBeenCalled();
    });

    it("allows deactivating a non-statutory component via update", async () => {
      db.salaryComponentDefinition.findFirst.mockResolvedValue({
        id: "c1",
        isStatutory: false,
      });
      db.salaryComponentDefinition.update.mockResolvedValue({
        id: "c1",
        isActive: false,
      });
      const req = makeReq({ params: { id: "c1" }, body: { isActive: false } });
      const res = makeRes();
      await updateSalaryComponent(req, res);
      expect(db.salaryComponentDefinition.update).toHaveBeenCalled();
    });

    it("blocks deleting a statutory component", async () => {
      db.salaryComponentDefinition.findFirst.mockResolvedValue({
        id: "c1",
        isStatutory: true,
      });
      const req = makeReq({ params: { id: "c1" } });
      const res = makeRes();
      await deleteSalaryComponent(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("Statutory"),
        }),
      );
      expect(db.salaryComponentDefinition.update).not.toHaveBeenCalled();
    });

    it("soft-deletes a non-statutory component by flipping isActive", async () => {
      db.salaryComponentDefinition.findFirst.mockResolvedValue({
        id: "c1",
        isStatutory: false,
      });
      db.salaryComponentDefinition.update.mockResolvedValue({});
      const req = makeReq({ params: { id: "c1" } });
      const res = makeRes();
      await deleteSalaryComponent(req, res);
      expect(db.salaryComponentDefinition.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { isActive: false },
      });
    });
  });

  describe("PT slabs", () => {
    it("lists slabs ordered by state then minGross", async () => {
      db.professionalTaxSlab.findMany.mockResolvedValue([]);
      const req = makeReq();
      const res = makeRes();
      await listPtSlabs(req, res);
      expect(db.professionalTaxSlab.findMany).toHaveBeenCalledWith({
        where: { tenantId: "t1" },
        orderBy: [{ state: "asc" }, { minGross: "asc" }],
      });
    });

    it("rejects create for a non-privileged member", async () => {
      const req = makeReq(NON_OWNER);
      const res = makeRes();
      await createPtSlab(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("creates a slab for a privileged user", async () => {
      db.professionalTaxSlab.create.mockResolvedValue({ id: "s1" });
      const req = makeReq({ body: { state: "MH", minGross: 0 } });
      const res = makeRes();
      await createPtSlab(req, res);
      expect(db.professionalTaxSlab.create).toHaveBeenCalledWith({
        data: { tenantId: "t1", state: "MH", minGross: 0 },
      });
    });

    it("returns NOT_FOUND updating a nonexistent slab", async () => {
      db.professionalTaxSlab.findFirst.mockResolvedValue(null);
      const req = makeReq({ params: { id: "s1" } });
      const res = makeRes();
      await updatePtSlab(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("deletes an existing slab", async () => {
      db.professionalTaxSlab.findFirst.mockResolvedValue({ id: "s1" });
      db.professionalTaxSlab.delete.mockResolvedValue({});
      const req = makeReq({ params: { id: "s1" } });
      const res = makeRes();
      await deletePtSlab(req, res);
      expect(db.professionalTaxSlab.delete).toHaveBeenCalledWith({
        where: { id: "s1" },
      });
    });
  });

  describe("Income tax slabs", () => {
    it("lists slabs ordered by FY desc, regime, minIncome", async () => {
      db.incomeTaxSlab.findMany.mockResolvedValue([]);
      const req = makeReq();
      const res = makeRes();
      await listIncomeTaxSlabs(req, res);
      expect(db.incomeTaxSlab.findMany).toHaveBeenCalledWith({
        where: { tenantId: "t1" },
        orderBy: [
          { financialYear: "desc" },
          { regime: "asc" },
          { minIncome: "asc" },
        ],
      });
    });

    it("rejects create for a non-privileged member", async () => {
      const req = makeReq(NON_OWNER);
      const res = makeRes();
      await createIncomeTaxSlab(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns NOT_FOUND updating a nonexistent slab", async () => {
      db.incomeTaxSlab.findFirst.mockResolvedValue(null);
      const req = makeReq({ params: { id: "s1" } });
      const res = makeRes();
      await updateIncomeTaxSlab(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("deletes an existing slab", async () => {
      db.incomeTaxSlab.findFirst.mockResolvedValue({ id: "s1" });
      db.incomeTaxSlab.delete.mockResolvedValue({});
      const req = makeReq({ params: { id: "s1" } });
      const res = makeRes();
      await deleteIncomeTaxSlab(req, res);
      expect(db.incomeTaxSlab.delete).toHaveBeenCalledWith({
        where: { id: "s1" },
      });
    });
  });

  describe("Pay cycles", () => {
    it("lists only active cycles, default first", async () => {
      db.payCycle.findMany.mockResolvedValue([]);
      const req = makeReq();
      const res = makeRes();
      await listPayCycles(req, res);
      expect(db.payCycle.findMany).toHaveBeenCalledWith({
        where: { tenantId: "t1", isActive: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
    });

    it("rejects create for a non-privileged member", async () => {
      const req = makeReq(NON_OWNER);
      const res = makeRes();
      await createPayCycle(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("unsets the previous default cycle when creating a new default", async () => {
      db.payCycle.updateMany.mockResolvedValue({ count: 1 });
      db.payCycle.create.mockResolvedValue({ id: "c2", isDefault: true });
      const req = makeReq({ body: { isDefault: true, name: "Monthly" } });
      const res = makeRes();

      await createPayCycle(req, res);

      expect(db.payCycle.updateMany).toHaveBeenCalledWith({
        where: { tenantId: "t1", isDefault: true },
        data: { isDefault: false },
      });
      expect(db.payCycle.create).toHaveBeenCalled();
    });

    it("does not touch other cycles when creating a non-default cycle", async () => {
      db.payCycle.create.mockResolvedValue({ id: "c2", isDefault: false });
      const req = makeReq({ body: { isDefault: false, name: "Weekly" } });
      const res = makeRes();
      await createPayCycle(req, res);
      expect(db.payCycle.updateMany).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND updating a nonexistent cycle", async () => {
      db.payCycle.findFirst.mockResolvedValue(null);
      const req = makeReq({ params: { id: "c1" } });
      const res = makeRes();
      await updatePayCycle(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });

    it("unsets other defaults (excluding itself) when updating to become default", async () => {
      db.payCycle.findFirst.mockResolvedValue({ id: "c1", isDefault: false });
      db.payCycle.updateMany.mockResolvedValue({ count: 1 });
      db.payCycle.update.mockResolvedValue({ id: "c1", isDefault: true });
      const req = makeReq({ params: { id: "c1" }, body: { isDefault: true } });
      const res = makeRes();

      await updatePayCycle(req, res);

      expect(db.payCycle.updateMany).toHaveBeenCalledWith({
        where: { tenantId: "t1", isDefault: true, id: { not: "c1" } },
        data: { isDefault: false },
      });
    });

    it("soft-deletes a cycle, clearing isActive and isDefault", async () => {
      db.payCycle.findFirst.mockResolvedValue({ id: "c1" });
      db.payCycle.update.mockResolvedValue({});
      const req = makeReq({ params: { id: "c1" } });
      const res = makeRes();
      await deletePayCycle(req, res);
      expect(db.payCycle.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { isActive: false, isDefault: false },
      });
    });

    it("returns NOT_FOUND deleting a nonexistent cycle", async () => {
      db.payCycle.findFirst.mockResolvedValue(null);
      const req = makeReq({ params: { id: "missing" } });
      const res = makeRes();
      await deletePayCycle(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
    });
  });

  describe("privilege via explicit grant", () => {
    it("allows a member with the Organisation:edit_organisation_settings grant to create a PT slab", async () => {
      db.user.findUnique.mockResolvedValue({
        permissions: ["Organisation:edit_organisation_settings"],
      });
      db.professionalTaxSlab.create.mockResolvedValue({ id: "s1" });
      const req = makeReq(NON_OWNER);
      const res = makeRes();
      await createPtSlab(req, res);
      expect(db.professionalTaxSlab.create).toHaveBeenCalled();
    });
  });
});
