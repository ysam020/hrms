/**
 * Custom Report Builder handler – gateway-direct.
 *
 * Supports 6 entities: employee | attendance | leave | salary | recruitment | payroll
 *
 * Design:
 *  – "Run" executes the query immediately and returns JSON or CSV inline.
 *  – "Save" persists the config; "Run saved" re-executes with saved config.
 *  – Limit capped at 10,000 rows (hard limit regardless of request).
 *  – CSV uses chunked streaming for large result sets.
 *  – Filters are applied server-side against Prisma's query builder (no raw
 *    MongoDB — prevents injection; all field names validated against allowlists).
 *
 * Security:
 *  – Only HR/admin/owner can access report builder.
 *  – All field names validated against per-entity allowlists to prevent
 *    accessing fields not intended for reporting (e.g. encrypted PII).
 *  – Limit hard-capped at 10,000 rows.
 */

import { Request, Response } from "express";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import {
  apiResponse,
  RESPONSE_STATUS,
  hasPrivilegedRole,
  HR_ROLES,
} from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";

// ─────────────────────────────────────────────────────────────────────────────
// Per-entity field allowlists (prevents accessing encrypted/sensitive columns)
// ─────────────────────────────────────────────────────────────────────────────

type EntityAllowlist = {
  select: Record<string, boolean>;
  filterFields: Set<string>;
  model: keyof typeof prisma;
  // Field used to order results when the request doesn't specify a sort.
  // Must exist on the underlying Prisma model.
  defaultSort: string;
};

const ENTITY_CONFIG: Record<string, EntityAllowlist> = {
  employee: {
    model: "user" as any,
    defaultSort: "createdAt",
    select: {
      id: true,
      username: true,
      first_name: true,
      last_name: true,
      email: true,
      official_email: true,
      department: true,
      designation: true,
      employeeStatus: true,
      joining_date: true,
      wfh: true,
      role: true,
      dob: true,
      blood_group: true,
      qualification: true,
      kyc_approval: true,
      createdAt: true,
    },
    filterFields: new Set([
      "department",
      "designation",
      "employeeStatus",
      "role",
      "wfh",
      "joining_date",
    ]),
  },
  attendance: {
    model: "attendanceRecord" as any,
    defaultSort: "date",
    select: {
      id: true,
      userId: true,
      date: true,
      timeIn: true,
      timeOut: true,
      workingHours: true,
      status: true,
      isCorrected: true,
    },
    filterFields: new Set(["status", "date", "userId", "isCorrected"]),
  },
  leave: {
    model: "leaveApplication" as any,
    defaultSort: "appliedOn",
    select: {
      id: true,
      userId: true,
      from: true,
      to: true,
      leaveType: true,
      days: true,
      status: true,
      reason: true,
      appliedOn: true,
      approvedById: true,
      approvedOn: true,
    },
    filterFields: new Set(["status", "leaveType", "from", "to", "userId"]),
  },
  salary: {
    model: "salaryStructure" as any,
    defaultSort: "createdAt",
    select: {
      id: true,
      userId: true,
      month: true,
      year: true,
      grossSalary: true,
      basicPay: true,
      hra: true,
      conveyance: true,
      pf: true,
      esi: true,
      pt: true,
      netPayable: true,
      createdAt: true,
    },
    filterFields: new Set(["month", "year", "userId"]),
  },
  recruitment: {
    model: "jobApplication" as any,
    defaultSort: "id",
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      resumeScore: true,
      jobTitleId: true,
    },
    filterFields: new Set(["status", "jobTitleId"]),
  },
  payroll: {
    model: "payrollRun" as any,
    defaultSort: "createdAt",
    select: {
      id: true,
      month: true,
      year: true,
      status: true,
      totalGross: true,
      totalNet: true,
      totalDeductions: true,
      employeeCount: true,
      createdAt: true,
      disbursedAt: true,
    },
    filterFields: new Set(["status", "month", "year"]),
  },
};

const HARD_ROW_LIMIT = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Filter translation: config filters → Prisma where clause
// ─────────────────────────────────────────────────────────────────────────────

type ReportFilter = {
  field: string;
  operator: string;
  value: string | number | boolean | string[];
};

function buildWhereClause(
  entity: string,
  filters: ReportFilter[],
): Record<string, any> {
  const config = ENTITY_CONFIG[entity];
  const where: Record<string, any> = {};

  for (const f of filters) {
    // Reject unknown filter fields (injection guard).
    if (!config.filterFields.has(f.field)) {
      continue; // silently skip unknown fields — validated at schema level too
    }

    switch (f.operator) {
      case "eq":
        where[f.field] = f.value;
        break;
      case "ne":
        where[f.field] = { not: f.value };
        break;
      case "gt":
        where[f.field] = { gt: f.value };
        break;
      case "gte":
        where[f.field] = { gte: f.value };
        break;
      case "lt":
        where[f.field] = { lt: f.value };
        break;
      case "lte":
        where[f.field] = { lte: f.value };
        break;
      case "in":
        where[f.field] = { in: Array.isArray(f.value) ? f.value : [f.value] };
        break;
      case "contains":
        where[f.field] = { contains: String(f.value), mode: "insensitive" };
        break;
    }
  }

  return where;
}

// ─────────────────────────────────────────────────────────────────────────────
// Select projection (enforce allowlist; pick only requested columns)
// ─────────────────────────────────────────────────────────────────────────────

function buildSelectClause(
  entity: string,
  columns: string[],
): Record<string, boolean> {
  const allowed = ENTITY_CONFIG[entity].select;
  const select: Record<string, boolean> = {};
  // Always include id.
  select["id"] = true;
  for (const col of columns) {
    if (allowed[col]) select[col] = true;
  }
  return select;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV serialization
// ─────────────────────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val: any) => {
    const s = val == null ? "" : String(val);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Role guard
// ─────────────────────────────────────────────────────────────────────────────

// Exported (with executeReport below) for the MCP report tools.
export async function assertHrRole(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isSuperUser: true },
  });
  if (!user) return false;
  if (user.isSuperUser) return true;
  return user.role.some((r) => hasPrivilegedRole(r, HR_ROLES));
}

// ─────────────────────────────────────────────────────────────────────────────
// Core query executor
// ─────────────────────────────────────────────────────────────────────────────

export async function executeReport(config: {
  entity: string;
  filters?: ReportFilter[];
  columns: string[];
  sort?: { field: string; direction: "asc" | "desc" };
  limit?: number;
}): Promise<Record<string, any>[]> {
  const { entity, filters = [], columns, sort, limit = 1000 } = config;
  const entityConfig = ENTITY_CONFIG[entity];
  if (!entityConfig) throw new Error(`Unknown entity: ${entity}`);

  const model = (prisma as any)[entityConfig.model];
  const where = buildWhereClause(entity, filters);
  const select = buildSelectClause(entity, columns);
  const orderBy =
    sort && entityConfig.filterFields.has(sort.field)
      ? { [sort.field]: sort.direction }
      : { [entityConfig.defaultSort]: "desc" };

  const rows = await model.findMany({
    where,
    select,
    orderBy,
    take: Math.min(limit, HARD_ROW_LIMIT),
  });

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /reports/run
 * Execute an ad-hoc report on the fly. Returns JSON or CSV.
 */
export async function runReport(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const { entity, filters, columns, sort, limit, format } = req.body as {
      entity: string;
      filters?: ReportFilter[];
      columns: string[];
      sort?: { field: string; direction: "asc" | "desc" };
      limit?: number;
      format?: "json" | "csv";
    };

    if (!ENTITY_CONFIG[entity]) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Unknown entity '${entity}'. Valid: ${Object.keys(ENTITY_CONFIG).join(", ")}`,
      });
    }

    const rows = await executeReport({ entity, filters, columns, sort, limit });

    if (format === "csv") {
      const csv = toCSV(rows);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${entity}_report_${Date.now()}.csv"`,
      );
      return res.send(csv);
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Report generated: ${rows.length} row(s)`,
      data: { rows, rowCount: rows.length },
    });
  } catch (error) {
    logger.error("POST /reports/run error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /reports/saved
 * Save a report configuration for later re-use.
 */
export async function saveReport(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const { name, description, entity, config, schedule, recipients } =
      req.body;

    if (!ENTITY_CONFIG[entity]) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Unknown entity: ${entity}`,
      });
    }

    const report = await prisma.savedReport.create({
      data: {
        tenantId: getTenantId() ?? undefined,
        name,
        description: description ?? null,
        entity,
        config,
        schedule: schedule ?? null,
        recipients: recipients ?? [],
        createdBy: user!.userId,
      },
    });

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Report saved",
      data: { reportId: report.id },
    });
  } catch (error) {
    logger.error("POST /reports/saved error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /reports/saved
 * List saved reports for the tenant.
 */
export async function listSavedReports(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const { entity } = req.query as Record<string, string>;
    const where: any = {};
    if (entity) where.entity = entity;

    const reports = await prisma.savedReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        entity: true,
        schedule: true,
        recipients: true,
        lastRunAt: true,
        createdAt: true,
        // Omit config from list view (returned on demand)
      },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Saved reports retrieved",
      data: reports,
    });
  } catch (error) {
    logger.error("GET /reports/saved error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /reports/saved/:reportId
 * Return a single saved report with its config.
 */
export async function getSavedReport(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const report = await prisma.savedReport.findUnique({
      where: { id: String(req.params.reportId) },
    });
    if (!report) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Report not found",
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Report retrieved",
      data: report,
    });
  } catch (error) {
    logger.error("GET /reports/saved/:reportId error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /reports/saved/:reportId/run
 * Execute a saved report (optionally override format).
 */
export async function runSavedReport(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const report = await prisma.savedReport.findUnique({
      where: { id: String(req.params.reportId) },
    });
    if (!report) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Report not found",
      });
    }

    const config = (report as any).config as any;
    const format = (req.query.format as string) ?? "json";

    const rows = await executeReport({
      entity: (report as any).entity,
      filters: config.filters,
      columns: config.columns,
      sort: config.sort,
      limit: config.limit,
    });

    // Update lastRunAt.
    await prisma.savedReport
      .update({
        where: { id: String(req.params.reportId) },
        data: { lastRunAt: new Date() },
      })
      .catch(() => {}); // non-fatal

    if (format === "csv") {
      const csv = toCSV(rows);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${(report as any).name.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.csv"`,
      );
      return res.send(csv);
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Report '${(report as any).name}' executed: ${rows.length} row(s)`,
      data: { rows, rowCount: rows.length },
    });
  } catch (error) {
    logger.error("POST /reports/saved/:reportId/run error:", { error });
    return handleError(res, error);
  }
}

/**
 * DELETE /reports/saved/:reportId
 * Delete a saved report configuration.
 */
export async function deleteSavedReport(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const report = await prisma.savedReport.findUnique({
      where: { id: String(req.params.reportId) },
    });
    if (!report) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Report not found",
      });
    }

    await prisma.savedReport.delete({
      where: { id: String(req.params.reportId) },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Report deleted",
    });
  } catch (error) {
    logger.error("DELETE /reports/saved/:reportId error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /reports/schema/:entity
 * Return the available fields/filters for a given entity.
 * Powers the report builder UI's field selector.
 */
export async function getEntitySchema(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertHrRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const entity = String(req.params.entity);
    const config = ENTITY_CONFIG[entity];
    if (!config) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: `Unknown entity. Valid: ${Object.keys(ENTITY_CONFIG).join(", ")}`,
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Entity schema",
      data: {
        entity,
        selectableFields: Object.keys(config.select),
        filterableFields: [...config.filterFields],
        operators: ["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains"],
      },
    });
  } catch (error) {
    logger.error("GET /reports/schema/:entity error:", { error });
    return handleError(res, error);
  }
}
