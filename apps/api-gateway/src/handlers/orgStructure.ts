import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
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
  return superUser || ["owner", "admin", "hr"].includes(tenantRole ?? "");
}

// ─── Departments ────────────────────────────────────────────────────────────────

export async function listDepartments(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const departments = await (prisma as any).department.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: departments });
  } catch (error: unknown) {
    logger.error("listDepartments error:", { error });
    return handleError(res, error);
  }
}

export async function createDepartment(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can manage departments.",
    });
  }
  try {
    const department = await (prisma as any).department.create({
      data: { tenantId, ...req.body },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Department added.",
      data: department,
    });
  } catch (error: unknown) {
    logger.error("createDepartment error:", { error });
    return handleError(res, error);
  }
}

export async function updateDepartment(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can manage departments.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).department.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Department not found.",
      });
    }
    const updated = await (prisma as any).department.update({
      where: { id },
      data: req.body,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Department updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updateDepartment error:", { error });
    return handleError(res, error);
  }
}

export async function deleteDepartment(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can manage departments.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).department.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Department not found.",
      });
    }
    await (prisma as any).department.update({
      where: { id },
      data: { isActive: false },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Department removed.",
    });
  } catch (error: unknown) {
    logger.error("deleteDepartment error:", { error });
    return handleError(res, error);
  }
}

// ─── Designations ───────────────────────────────────────────────────────────────

export async function listDesignations(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const designations = await (prisma as any).designation.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: designations });
  } catch (error: unknown) {
    logger.error("listDesignations error:", { error });
    return handleError(res, error);
  }
}

export async function createDesignation(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can manage designations.",
    });
  }
  try {
    const designation = await (prisma as any).designation.create({
      data: { tenantId, ...req.body },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Designation added.",
      data: designation,
    });
  } catch (error: unknown) {
    logger.error("createDesignation error:", { error });
    return handleError(res, error);
  }
}

export async function updateDesignation(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can manage designations.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).designation.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Designation not found.",
      });
    }
    const updated = await (prisma as any).designation.update({
      where: { id },
      data: req.body,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Designation updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updateDesignation error:", { error });
    return handleError(res, error);
  }
}

export async function deleteDesignation(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can manage designations.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).designation.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Designation not found.",
      });
    }
    await (prisma as any).designation.update({
      where: { id },
      data: { isActive: false },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Designation removed.",
    });
  } catch (error: unknown) {
    logger.error("deleteDesignation error:", { error });
    return handleError(res, error);
  }
}

// ─── One-time migration from free-text ───────────────────────────────────────

/**
 * POST /org-structure/migrate-from-free-text
 * Owner/admin-triggered, per-tenant, idempotent. Collects distinct non-null
 * User.department/designation strings, creates matching Department/
 * Designation rows (skipping ones that already exist by name), and backfills
 * User.departmentId/designationId by string match. Never runs automatically —
 * tenants that don't call this keep working purely off the free-text strings.
 */
export async function migrateFromFreeText(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can run this migration.",
    });
  }
  try {
    const { userId } = req.user!;
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, department: true, designation: true },
    });

    const departmentNames = [
      ...new Set(
        users.map((u) => u.department).filter((d): d is string => !!d?.trim()),
      ),
    ];
    const designationNames = [
      ...new Set(
        users.map((u) => u.designation).filter((d): d is string => !!d?.trim()),
      ),
    ];

    const [existingDepartments, existingDesignations] = await Promise.all([
      (prisma as any).department.findMany({ where: { tenantId } }),
      (prisma as any).designation.findMany({ where: { tenantId } }),
    ]);
    const existingDeptNames = new Set(
      existingDepartments.map((d: any) => d.name),
    );
    const existingDesigNames = new Set(
      existingDesignations.map((d: any) => d.name),
    );

    const newDepartments = departmentNames.filter(
      (n) => !existingDeptNames.has(n),
    );
    const newDesignations = designationNames.filter(
      (n) => !existingDesigNames.has(n),
    );

    if (newDepartments.length > 0) {
      await (prisma as any).department.createMany({
        data: newDepartments.map((name) => ({
          tenantId,
          name,
          createdBy: userId,
        })),
      });
    }
    if (newDesignations.length > 0) {
      await (prisma as any).designation.createMany({
        data: newDesignations.map((name) => ({
          tenantId,
          name,
          createdBy: userId,
        })),
      });
    }

    const [allDepartments, allDesignations] = await Promise.all([
      (prisma as any).department.findMany({ where: { tenantId } }),
      (prisma as any).designation.findMany({ where: { tenantId } }),
    ]);
    const deptIdByName = new Map<string, string>(
      allDepartments.map((d: any) => [d.name, d.id]),
    );
    const desigIdByName = new Map<string, string>(
      allDesignations.map((d: any) => [d.name, d.id]),
    );

    let backfilledUsers = 0;
    for (const u of users) {
      const departmentId = u.department
        ? deptIdByName.get(u.department)
        : undefined;
      const designationId = u.designation
        ? desigIdByName.get(u.designation)
        : undefined;
      if (!departmentId && !designationId) continue;
      await prisma.user.update({
        where: { id: u.id },
        data: {
          ...(departmentId && { departmentId }),
          ...(designationId && { designationId }),
        },
      });
      backfilledUsers++;
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Migrated ${newDepartments.length} department(s), ${newDesignations.length} designation(s), backfilled ${backfilledUsers} employee(s).`,
      data: {
        departmentsCreated: newDepartments.length,
        designationsCreated: newDesignations.length,
        usersBackfilled: backfilledUsers,
      },
    });
  } catch (error: unknown) {
    logger.error("migrateFromFreeText error:", { error });
    return handleError(res, error);
  }
}
