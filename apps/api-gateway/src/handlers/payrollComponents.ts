import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS, hasPrivilegedRole } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { isSuperUser } from "../utils/user";

function requireTenantId(req: AuthRequest, res: Response): string | null {
  const { tenantId } = req.user!;
  if (!tenantId) {
    apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
    return null;
  }
  return tenantId;
}

async function isPrivileged(req: AuthRequest): Promise<boolean> {
  const { userId, tenantRole } = req.user!;
  const superUser = await isSuperUser(userId);
  if (superUser || hasPrivilegedRole(tenantRole ?? "")) {
    return true;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });
  return (user?.permissions ?? []).includes(
    "Organisation:edit_organisation_settings",
  );
}

// ─── Salary component definitions ──────────────────────────────────────────────

// The six components every payroll/payslip calculation has always hardcoded.
// Seeded once per tenant (idempotent upsert, keyed by the tenantId+code unique
// index) with values matching the old hardcoded behavior exactly, so seeding
// a tenant changes nothing until they actually edit a rate in Settings.
const DEFAULT_COMPONENTS = [
  {
    code: "BASIC",
    name: "Basic Pay",
    type: "earning",
    calcType: "fixed",
    percentOf: null,
    percentValue: null,
    isStatutory: false,
    displayOrder: 0,
  },
  {
    code: "HRA",
    name: "HRA",
    type: "earning",
    calcType: "fixed",
    percentOf: null,
    percentValue: null,
    isStatutory: false,
    displayOrder: 1,
  },
  {
    code: "CONVEYANCE",
    name: "Conveyance Allowance",
    type: "earning",
    calcType: "fixed",
    percentOf: null,
    percentValue: null,
    isStatutory: false,
    displayOrder: 2,
  },
  {
    code: "PF",
    name: "Provident Fund",
    type: "deduction",
    calcType: "percent_of_basic",
    percentOf: "basic",
    percentValue: 12,
    isStatutory: true,
    displayOrder: 3,
  },
  {
    code: "ESI",
    name: "ESI",
    type: "deduction",
    calcType: "percent_of_basic",
    percentOf: "gross",
    percentValue: 1.75,
    isStatutory: true,
    displayOrder: 4,
  },
  {
    code: "PT",
    name: "Professional Tax",
    type: "deduction",
    calcType: "fixed",
    percentOf: null,
    percentValue: 200,
    isStatutory: true,
    displayOrder: 5,
  },
];

async function seedDefaultComponentsIfMissing(
  tenantId: string,
  createdBy: string,
): Promise<void> {
  const existing = await (prisma as any).salaryComponentDefinition.findFirst({
    where: { tenantId },
    select: { id: true },
  });
  if (existing) return;

  await Promise.all(
    DEFAULT_COMPONENTS.map((c) =>
      (prisma as any).salaryComponentDefinition.upsert({
        where: { tenantId_code: { tenantId, code: c.code } },
        update: {},
        create: { tenantId, createdBy, ...c },
      }),
    ),
  );
}

export async function listSalaryComponents(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    await seedDefaultComponentsIfMissing(tenantId, req.user!.userId);
    const components = await (prisma as any).salaryComponentDefinition.findMany(
      {
        where: { tenantId, isActive: true },
        orderBy: { displayOrder: "asc" },
      },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: components });
  } catch (error: unknown) {
    logger.error("listSalaryComponents error:", { error });
    return handleError(res, error);
  }
}

export async function createSalaryComponent(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure salary components.",
    });
  }
  try {
    const { userId } = req.user!;
    const component = await (prisma as any).salaryComponentDefinition.create({
      data: {
        tenantId,
        ...req.body,
        code: req.body.code.toUpperCase(),
        createdBy: userId,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Component added.",
      data: component,
    });
  } catch (error: unknown) {
    logger.error("createSalaryComponent error:", { error });
    return handleError(res, error);
  }
}

export async function updateSalaryComponent(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure salary components.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).salaryComponentDefinition.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Component not found.",
      });
    }
    if (existing.isStatutory && req.body.isActive === false) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Statutory components (PF/ESI/PT) can't be deactivated.",
      });
    }
    const updated = await (prisma as any).salaryComponentDefinition.update({
      where: { id },
      data: req.body,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Component updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updateSalaryComponent error:", { error });
    return handleError(res, error);
  }
}

export async function deleteSalaryComponent(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure salary components.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).salaryComponentDefinition.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Component not found.",
      });
    }
    if (existing.isStatutory) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Statutory components (PF/ESI/PT) can't be removed.",
      });
    }
    await (prisma as any).salaryComponentDefinition.update({
      where: { id },
      data: { isActive: false },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Component removed.",
    });
  } catch (error: unknown) {
    logger.error("deleteSalaryComponent error:", { error });
    return handleError(res, error);
  }
}

// ─── Professional Tax slabs ─────────────────────────────────────────────────────

export async function listPtSlabs(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const slabs = await (prisma as any).professionalTaxSlab.findMany({
      where: { tenantId },
      orderBy: [{ state: "asc" }, { minGross: "asc" }],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: slabs });
  } catch (error: unknown) {
    logger.error("listPtSlabs error:", { error });
    return handleError(res, error);
  }
}

export async function createPtSlab(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure Professional Tax slabs.",
    });
  }
  try {
    const slab = await (prisma as any).professionalTaxSlab.create({
      data: { tenantId, ...req.body },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Slab added.",
      data: slab,
    });
  } catch (error: unknown) {
    logger.error("createPtSlab error:", { error });
    return handleError(res, error);
  }
}

export async function updatePtSlab(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure Professional Tax slabs.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).professionalTaxSlab.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Slab not found.",
      });
    }
    const updated = await (prisma as any).professionalTaxSlab.update({
      where: { id },
      data: req.body,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Slab updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updatePtSlab error:", { error });
    return handleError(res, error);
  }
}

export async function deletePtSlab(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure Professional Tax slabs.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).professionalTaxSlab.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Slab not found.",
      });
    }
    await (prisma as any).professionalTaxSlab.delete({ where: { id } });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Slab removed.",
    });
  } catch (error: unknown) {
    logger.error("deletePtSlab error:", { error });
    return handleError(res, error);
  }
}

// ─── Income Tax (TDS) slabs ─────────────────────────────────────────────────────

export async function listIncomeTaxSlabs(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const slabs = await (prisma as any).incomeTaxSlab.findMany({
      where: { tenantId },
      orderBy: [
        { financialYear: "desc" },
        { regime: "asc" },
        { minIncome: "asc" },
      ],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: slabs });
  } catch (error: unknown) {
    logger.error("listIncomeTaxSlabs error:", { error });
    return handleError(res, error);
  }
}

export async function createIncomeTaxSlab(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure Income Tax slabs.",
    });
  }
  try {
    const slab = await (prisma as any).incomeTaxSlab.create({
      data: { tenantId, ...req.body },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Slab added.",
      data: slab,
    });
  } catch (error: unknown) {
    logger.error("createIncomeTaxSlab error:", { error });
    return handleError(res, error);
  }
}

export async function updateIncomeTaxSlab(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure Income Tax slabs.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).incomeTaxSlab.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Slab not found.",
      });
    }
    const updated = await (prisma as any).incomeTaxSlab.update({
      where: { id },
      data: req.body,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Slab updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updateIncomeTaxSlab error:", { error });
    return handleError(res, error);
  }
}

export async function deleteIncomeTaxSlab(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure Income Tax slabs.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).incomeTaxSlab.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Slab not found.",
      });
    }
    await (prisma as any).incomeTaxSlab.delete({ where: { id } });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Slab removed.",
    });
  } catch (error: unknown) {
    logger.error("deleteIncomeTaxSlab error:", { error });
    return handleError(res, error);
  }
}

// ─── Pay cycles ─────────────────────────────────────────────────────────────────

export async function listPayCycles(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const cycles = await (prisma as any).payCycle.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: cycles });
  } catch (error: unknown) {
    logger.error("listPayCycles error:", { error });
    return handleError(res, error);
  }
}

export async function createPayCycle(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure pay cycles.",
    });
  }
  try {
    const { isDefault } = req.body;
    if (isDefault) {
      await (prisma as any).payCycle.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const cycle = await (prisma as any).payCycle.create({
      data: { tenantId, ...req.body },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pay cycle added.",
      data: cycle,
    });
  } catch (error: unknown) {
    logger.error("createPayCycle error:", { error });
    return handleError(res, error);
  }
}

export async function updatePayCycle(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure pay cycles.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).payCycle.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Pay cycle not found.",
      });
    }
    if (req.body.isDefault === true) {
      await (prisma as any).payCycle.updateMany({
        where: { tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    const updated = await (prisma as any).payCycle.update({
      where: { id },
      data: req.body,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pay cycle updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updatePayCycle error:", { error });
    return handleError(res, error);
  }
}

export async function deletePayCycle(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can configure pay cycles.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).payCycle.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Pay cycle not found.",
      });
    }
    await (prisma as any).payCycle.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pay cycle removed.",
    });
  } catch (error: unknown) {
    logger.error("deletePayCycle error:", { error });
    return handleError(res, error);
  }
}
