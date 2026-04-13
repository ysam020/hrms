import { Request, Response } from "express";
import { z } from "zod";
import { hrmCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { jsPDF } from "jspdf";
import { apiResponse, RESPONSE_STATUS, errorMessage } from "@hrms/common";
import { cacheManager } from "@hrms/cache";
import { validateBody } from "../middleware/validate";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const hrActivitySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(""),
  date: z.string().max(50).optional().default(""),
  time: z.string().max(20).optional().default(""),
  status: z.string().max(50).optional().default("Active"),
});

const conditionSchema = z.object({
  field: z.string().max(100),
  operator: z.enum([
    "equals",
    "greater_than",
    "less_than",
    "greater_or_equal",
    "less_or_equal",
    "between",
    "not_between",
  ]),
  value: z.union([z.string(), z.number()]),
  valueTo: z.union([z.string(), z.number()]).optional(),
});

const actionSchema = z.object({
  type: z.string().max(100),
  params: z.record(z.unknown()).optional(),
});

const ruleSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(0).optional().default(0),
  status: z.enum(["draft", "active", "inactive"]).optional().default("draft"),
  tags: z.array(z.string().max(50)).optional().default([]),
  conditions: z.array(conditionSchema).optional(),
  conditionLogic: z.enum(["AND", "OR"]).optional().default("AND"),
  actions: z.array(actionSchema).optional(),
  effectiveFrom: z.string().max(50).optional(),
  effectiveTo: z.string().max(50).optional(),
});

const updateRuleStatusSchema = z.object({
  status: z.enum(["draft", "active", "inactive"]),
});

const policySchema = z.object({
  policyType: z.string().min(1).max(100),
  policyName: z.string().max(200).optional().default(""),
  content: z.string().min(1).max(100_000),
});

export const validateAddHrActivity = validateBody(hrActivitySchema);
export const validateEditHrActivity = validateBody(
  hrActivitySchema.partial().extend({
    title: z.string().min(1).max(200).optional(),
  }),
);
export const validateCreateRule = validateBody(ruleSchema);
export const validateUpdateRule = validateBody(ruleSchema.partial());
export const validateUpdateRuleStatus = validateBody(updateRuleStatusSchema);
export const validateCreatePolicy = validateBody(policySchema);
export const validateUpdatePolicy = validateBody(policySchema.partial());

export async function getHrActivities(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const statusFilter = (req.query.status as string) || "Active";
    const skip = (page - 1) * limit;

    const cacheKey = `hrm:activities:${page}:${limit}:${statusFilter}`;
    const cached = await cacheManager.get<any>(cacheKey);
    if (cached) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "HR activities listed successfully",
        status: 0,
        data: cached,
      });
    }

    const where: any = { status: { not: "deleted" } };
    if (statusFilter && statusFilter.toLowerCase() !== "all") {
      where.status = statusFilter;
    }

    const [activities, totalCount] = await Promise.all([
      prisma.hrActivity.findMany({
        where,
        orderBy: { createdOn: "desc" },
        skip,
        take: limit,
      }),
      prisma.hrActivity.count({ where }),
    ]);

    const data = {
      activities: activities.map((a: any) => ({
        id: a.id,
        title: a.title,
        description: a.description || "",
        date: a.date || "",
        time: a.time || "",
        status: a.status || "",
        createdBy: a.createdBy || "",
        createdOn: a.createdOn ? a.createdOn.toISOString() : "",
        lastUpdatedBy: a.lastUpdatedBy || "",
        lastUpdatedOn: a.lastUpdatedOn ? a.lastUpdatedOn.toISOString() : "",
      })),
      pagination: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
    await cacheManager.set(cacheKey, data, "hrActivity");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "HR activities listed successfully",
      status: 0,
      data,
    });
  } catch (error: any) {
    logger.error("GET /get-hr-activities error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getHrActivity(req: Request, res: Response) {
  try {
    const response = await hrmCall("getHrActivity", {
      id: req.params._id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function addHrActivity(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { title, description, date, time, status } = req.body;
    const response = await hrmCall("createHrActivity", {
      title,
      description,
      date,
      time,
      status,
      createdBy: user!.userId,
    });
    await cacheManager.invalidatePattern("hrm:activities:*");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function editHrActivity(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { title, description, date, time, status } = req.body;
    const response = await hrmCall("updateHrActivity", {
      title,
      description,
      date,
      time,
      status,
      id: req.params._id,
      updatedBy: user!.userId,
    });
    await cacheManager.invalidatePattern("hrm:activities:*");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function deleteHrActivity(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const existing = await prisma.hrActivity.findUnique({
      where: { id: String(req.params._id) },
    });
    if (!existing)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "HR activity not found",
      });

    await prisma.hrActivity.update({
      where: { id: String(req.params._id) },
      data: {
        status: "deleted",
        deletedBy: user?.userId || "",
        deletedOn: new Date(),
      },
    });
    await cacheManager.invalidatePattern("hrm:activities:*");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "HR activity deleted successfully",
      status: 0,
    });
  } catch (error: any) {
    logger.error("DELETE /delete-hr-activity error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getRules(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      category,
      status: ruleStatus,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string>;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 200);
    const skip = (pageNum - 1) * limitNum;

    const cacheKey = `hrm:rules:${pageNum}:${limitNum}:${category || "all"}:${ruleStatus || "all"}`;
    const cached = await cacheManager.get<any>(cacheKey);
    if (cached) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Rules listed successfully",
        status: 0,
        ...cached,
      });
    }

    const where: any = {};
    if (category && category !== "all") where.category = category;
    if (ruleStatus && ruleStatus !== "all") where.status = ruleStatus;

    const [rules, total] = await Promise.all([
      prisma.rule.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.rule.count({ where }),
    ]);

    const data = rules.map((r: any) => ({ ...r, _id: r.id }));
    const payload = {
      data,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    };
    await cacheManager.set(cacheKey, payload, "system");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Rules listed successfully",
      status: 0,
      ...payload,
    });
  } catch (error: any) {
    logger.error("GET /rules error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function createRule(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      name,
      category,
      description,
      priority,
      status,
      tags,
      conditions,
      conditionLogic,
      actions,
      effectiveFrom,
      effectiveTo,
    } = req.body;
    const rule = await prisma.rule.create({
      data: {
        name,
        category,
        description,
        priority: priority || 0,
        status: status || "draft",
        tags: tags || [],
        conditions: conditions || undefined,
        conditionLogic: conditionLogic || "AND",
        actions: actions || undefined,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : undefined,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : undefined,
        createdBy: user!.userId,
      },
    });
    await cacheManager.invalidatePattern("hrm:rules:*");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Rule created successfully",
      status: 0,
      data: { ...rule, _id: rule.id },
    });
  } catch (error: any) {
    logger.error("POST /rules error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function updateRule(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      name,
      category,
      description,
      priority,
      status,
      tags,
      conditions,
      conditionLogic,
      actions,
      effectiveFrom,
      effectiveTo,
    } = req.body;
    const rule = await prisma.rule.update({
      where: { id: String(req.params.id) },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(description !== undefined && { description }),
        ...(priority !== undefined && { priority }),
        ...(status !== undefined && { status }),
        ...(tags !== undefined && { tags }),
        ...(conditions !== undefined && { conditions }),
        ...(conditionLogic !== undefined && { conditionLogic }),
        ...(actions !== undefined && { actions }),
        ...(effectiveFrom !== undefined && {
          effectiveFrom: new Date(effectiveFrom),
        }),
        ...(effectiveTo !== undefined && {
          effectiveTo: new Date(effectiveTo),
        }),
        lastModifiedBy: user!.userId,
      },
    });
    await cacheManager.invalidatePattern("hrm:rules:*");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Rule updated successfully",
      status: 0,
      data: { ...rule, _id: rule.id },
    });
  } catch (error: any) {
    logger.error("PUT /rules/:id error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function deleteRule(req: Request, res: Response) {
  try {
    await prisma.rule.delete({ where: { id: String(req.params.id) } });
    await cacheManager.invalidatePattern("hrm:rules:*");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Rule deleted successfully",
      status: 0,
    });
  } catch (error: any) {
    logger.error("DELETE /rules/:id error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function updateRuleStatus(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { status } = req.body;
    const rule = await prisma.rule.update({
      where: { id: String(req.params.id) },
      data: { status, lastModifiedBy: user!.userId },
    });
    await cacheManager.invalidatePattern("hrm:rules:*");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Rule status updated",
      status: 0,
      data: { ...rule, _id: rule.id },
    });
  } catch (error: any) {
    logger.error("PATCH /rules/:id/status error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function testRule(req: Request, res: Response) {
  try {
    const { rule, testData } = req.body;
    if (!rule || !testData) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "rule and testData are required",
      });
    }

    const conditions: any[] = Array.isArray(rule.conditions)
      ? rule.conditions
      : [];
    const logic: string = rule.conditionLogic || "AND";

    const evalCondition = (cond: any): boolean => {
      const actual = testData[cond.field];
      const expected = cond.value;
      switch (cond.operator) {
        case "equals":
          return String(actual) === String(expected);
        case "greater_than":
          return Number(actual) > Number(expected);
        case "less_than":
          return Number(actual) < Number(expected);
        case "greater_or_equal":
          return Number(actual) >= Number(expected);
        case "less_or_equal":
          return Number(actual) <= Number(expected);
        case "between":
          return (
            Number(actual) >= Number(expected) &&
            Number(actual) <= Number(cond.valueTo)
          );
        case "not_between":
          return (
            Number(actual) < Number(expected) ||
            Number(actual) > Number(cond.valueTo)
          );
        default:
          return false;
      }
    };

    const results = conditions.map((c) => ({
      condition: c,
      passed: evalCondition(c),
    }));
    const triggered =
      results.length === 0
        ? false
        : logic === "OR"
          ? results.some((r) => r.passed)
          : results.every((r) => r.passed);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Rule test completed",
      status: 0,
      data: {
        triggered,
        conditionResults: results,
        actions: triggered
          ? Array.isArray(rule.actions)
            ? rule.actions
            : []
          : [],
      },
    });
  } catch (error: any) {
    logger.error("POST /rules/test error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getPolicies(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const skip = (page - 1) * limit;

    const cacheKey = `hrm:policies:${page}:${limit}`;
    const cached = await cacheManager.get<any>(cacheKey);
    if (cached) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Policies listed",
        status: 0,
        ...cached,
      });
    }

    const notDeleted = { status: { notIn: ["deleted", "Deleted"] } };
    const [policies, total] = await Promise.all([
      prisma.policy.findMany({
        where: notDeleted,
        skip,
        take: limit,
        orderBy: { createdOn: "desc" },
      }),
      prisma.policy.count({ where: notDeleted }),
    ]);

    const data = policies.map((p: any) => ({
      ...p,
      category: p.policyType,
      title: p.policyName,
      createdAt: p.createdOn,
      updatedAt: p.lastUpdatedOn,
    }));

    const payload = { data, total, page, totalPages: Math.ceil(total / limit) };
    await cacheManager.set(cacheKey, payload, "system");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Policies listed",
      status: 0,
      ...payload,
    });
  } catch (error: any) {
    logger.error("GET /policies error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function createOrUpdatePolicy(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { policyType, policyName, content } = req.body;
    if (!policyType || !content) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "policyType and content are required",
      });
    }

    const matchQuery: any = {
      status: { notIn: ["deleted", "Deleted"] },
      policyType,
    };
    if (policyType === "Other" && policyName)
      matchQuery.policyName = policyName;

    const existing = await prisma.policy.findFirst({ where: matchQuery });
    if (existing) {
      const updated = await prisma.policy.update({
        where: { id: existing.id },
        data: {
          content,
          policyName: policyName || existing.policyName,
          lastUpdatedOn: new Date(),
          lastUpdatedBy: user!.userId,
        },
      });
      await cacheManager.invalidatePattern("hrm:policies:*");
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Policy updated successfully",
        status: 0,
        data: updated,
      });
    }

    const policy = await prisma.policy.create({
      data: {
        policyType,
        policyName: policyName || policyType,
        content,
        status: "active",
        createdBy: user!.userId,
        createdOn: new Date(),
      },
    });
    await cacheManager.invalidatePattern("hrm:policies:*");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Policy created successfully",
      status: 0,
      data: policy,
    });
  } catch (error: any) {
    logger.error("POST /policies error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getPolicyPdf(req: Request, res: Response) {
  try {
    const policy = await prisma.policy.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!policy)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Policy not found",
      });

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 22;
    const contentWidth = pageW - marginX * 2;

    const navyD: [number, number, number] = [15, 45, 96];
    const blue: [number, number, number] = [41, 105, 176];
    const steel: [number, number, number] = [88, 148, 199];
    const powder: [number, number, number] = [176, 210, 235];
    const textDark: [number, number, number] = [25, 30, 50];
    const textMid: [number, number, number] = [80, 90, 110];
    const textLight: [number, number, number] = [150, 155, 170];

    const fillPoly = (pts: number[][], color: [number, number, number]) => {
      doc.setFillColor(...color);
      const [sx, sy] = pts[0];
      const moves: number[][] = [];
      for (let i = 1; i < pts.length; i++) {
        moves.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      }
      doc.lines(moves, sx, sy, [1, 1], "F", true);
    };

    fillPoly(
      [
        [pageW - 90, 0],
        [pageW, 0],
        [pageW, 90],
      ],
      navyD,
    );
    fillPoly(
      [
        [pageW - 113, 0],
        [pageW - 90, 0],
        [pageW, 90],
        [pageW, 113],
      ],
      steel,
    );
    fillPoly(
      [
        [pageW - 126, 0],
        [pageW - 113, 0],
        [pageW, 113],
        [pageW, 126],
      ],
      powder,
    );
    fillPoly(
      [
        [pageW - 55, 140],
        [pageW - 35, 120],
        [pageW - 15, 140],
        [pageW - 35, 160],
      ],
      powder,
    );
    fillPoly(
      [
        [0, pageH - 90],
        [0, pageH],
        [90, pageH],
      ],
      powder,
    );
    fillPoly(
      [
        [0, pageH - 113],
        [0, pageH - 90],
        [90, pageH],
        [113, pageH],
      ],
      steel,
    );
    fillPoly(
      [
        [0, pageH - 126],
        [0, pageH - 113],
        [113, pageH],
        [126, pageH],
      ],
      navyD,
    );
    fillPoly(
      [
        [35, pageH - 160],
        [55, pageH - 140],
        [35, pageH - 120],
        [15, pageH - 140],
      ],
      powder,
    );

    doc.setFillColor(...navyD);
    doc.circle(marginX + 5, 30, 5.5, "F");
    doc.setTextColor(...steel);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("P", marginX + 5, 33.2, { align: "center" });
    doc.setTextColor(...navyD);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Praesto", marginX + 13, 33.5);

    const displayTitle =
      policy.policyType === "Other" && policy.policyName
        ? policy.policyName
        : policy.policyType;
    doc.setFontSize(34);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...navyD);
    const titleLines = doc.splitTextToSize(
      displayTitle.toUpperCase(),
      pageW - marginX * 2 - 20,
    );
    const titleY = 118;
    titleLines.forEach((line: string, i: number) => {
      doc.text(line, marginX, titleY + i * 14);
    });

    const subtitleY = titleY + titleLines.length * 14 + 8;
    doc.setTextColor(...steel);
    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.text("Office Policy Document", marginX, subtitleY);
    doc.setDrawColor(...steel);
    doc.setLineWidth(1);
    doc.line(marginX, subtitleY + 5, marginX + 58, subtitleY + 5);

    const prepY = subtitleY + 20;
    doc.setTextColor(...textMid);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Prepared By", marginX, prepY);
    if (policy.createdBy) {
      doc.setTextColor(...blue);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(policy.createdBy, marginX, prepY + 8);
    }
    if (policy.createdOn) {
      doc.setTextColor(...textLight);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(
        new Date(policy.createdOn).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        marginX,
        prepY + 17,
      );
    }

    doc.addPage();

    const drawPageHeader = () => {
      doc.setFillColor(...navyD);
      doc.rect(0, 0, pageW, 13, "F");
      doc.setFillColor(...steel);
      doc.rect(0, 11, pageW, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Praesto", marginX, 8.5);
      doc.setFont("helvetica", "normal");
      doc.text(policy.policyType, pageW - marginX, 8.5, { align: "right" });
    };

    drawPageHeader();
    let cursorY = 23;

    const HTML_ENTITIES: Record<string, string> = {
      "&nbsp;": " ",
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#39;": "'",
    };
    // Single-pass replacement prevents double-unescaping (e.g. &amp;lt; → &lt;, not <)
    const decodeHtml = (s: string) =>
      s.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (m) => HTML_ENTITIES[m] ?? m);

    const textOf = (html: string) => {
      let text = html.replace(/<br\s*\/?>/gi, " ");
      // Strip tags iteratively — a single pass can miss malformed/nested angle brackets
      let prev: string;
      do {
        prev = text;
        text = text.replace(/<[^>]*>/g, "");
      } while (text !== prev);
      return decodeHtml(text.replace(/\s+/g, " ").trim());
    };

    const content = policy.content || "";
    const flatHtml = content.replace(/<\/?(ul|ol)\b[^>]*>/gi, "");
    const blocks: { type: string; text: string }[] = [];
    const tagRe = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let lastEnd = 0;
    let m: RegExpExecArray | null;

    while ((m = tagRe.exec(flatHtml)) !== null) {
      if (m.index > lastEnd) {
        const gap = textOf(flatHtml.slice(lastEnd, m.index));
        if (gap) blocks.push({ type: "p", text: gap });
      }
      const tag = m[1].toLowerCase();
      const text = textOf(m[2]);
      if (text) {
        const type = /h[12]/.test(tag)
          ? "h1"
          : /h[3-6]/.test(tag)
            ? "h2"
            : tag === "li"
              ? "li"
              : "p";
        blocks.push({ type, text });
      }
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd < flatHtml.length) {
      const tail = textOf(flatHtml.slice(lastEnd));
      if (tail) blocks.push({ type: "p", text: tail });
    }

    const bodyLineH = 5.2;
    const paraGap = 2.5;
    const ensureSpace = (neededH: number) => {
      if (cursorY + neededH > pageH - 16) {
        doc.addPage();
        drawPageHeader();
        cursorY = 23;
      }
    };

    for (const block of blocks) {
      if (block.type === "h1") {
        cursorY += 6;
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        const lines = doc.splitTextToSize(block.text, contentWidth);
        ensureSpace(lines.length * 7 + 6);
        doc.setTextColor(...navyD);
        doc.text(lines, marginX, cursorY);
        cursorY += lines.length * 7 + 4;
      } else if (block.type === "h2") {
        cursorY += 3;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        const lines = doc.splitTextToSize(block.text, contentWidth);
        ensureSpace(lines.length * 5.8 + 4);
        doc.setTextColor(...textMid);
        doc.text(lines, marginX, cursorY);
        cursorY += lines.length * 5.8 + 3;
      } else if (block.type === "li") {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(block.text, contentWidth - 8);
        ensureSpace(lines.length * bodyLineH + 2);
        doc.setFillColor(...steel);
        doc.circle(marginX + 2.5, cursorY - 1.8, 1.5, "F");
        doc.setFillColor(255, 255, 255);
        doc.circle(marginX + 2.5, cursorY - 1.8, 0.7, "F");
        doc.setTextColor(...textDark);
        doc.text(lines, marginX + 7, cursorY);
        cursorY += lines.length * bodyLineH + 2;
      } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(block.text, contentWidth);
        ensureSpace(lines.length * bodyLineH + paraGap);
        doc.setTextColor(...textDark);
        doc.text(lines, marginX, cursorY);
        cursorY += lines.length * bodyLineH + paraGap;
      }
    }

    const totalPages = (doc.internal as any).getNumberOfPages();
    for (let i = 2; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFillColor(...navyD);
      doc.rect(0, pageH - 11, pageW, 11, "F");
      doc.setFillColor(...steel);
      doc.rect(0, pageH - 13, pageW, 2, "F");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(255, 255, 255);
      doc.text("Confidential – For Internal Use Only", marginX, pageH - 4);
      doc.text(
        `Page ${i - 1} of ${totalPages - 1}`,
        pageW - marginX,
        pageH - 4,
        { align: "right" },
      );
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const safeType = displayTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeType}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    return res.send(pdfBuffer);
  } catch (error: any) {
    logger.error("GET /policies/:id/pdf error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getPolicy(req: Request, res: Response) {
  try {
    const response = await hrmCall("getPolicy", {
      id: req.params.id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function updatePolicy(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { policyType, policyName, content } = req.body;
    const policy = await prisma.policy.update({
      where: { id: String(req.params.id) },
      data: {
        ...(policyType && { policyType }),
        ...(policyName !== undefined && { policyName }),
        ...(content && { content }),
        lastUpdatedOn: new Date(),
        lastUpdatedBy: user?.userId || "",
      },
    });
    await cacheManager.invalidatePattern("hrm:policies:*");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Policy updated successfully",
      status: 0,
      data: policy,
    });
  } catch (error: any) {
    logger.error("PUT /policies/:id error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function deletePolicy(req: Request, res: Response) {
  try {
    await prisma.policy.update({
      where: { id: String(req.params.id) },
      data: { status: "Deleted" },
    });
    await cacheManager.invalidatePattern("hrm:policies:*");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Policy deleted successfully",
      status: 0,
    });
  } catch (error: any) {
    logger.error("DELETE /policies/:id error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function isSuperuser(req: Request, res: Response) {
  try {
    const response = await hrmCall("checkPermission", {
      userId: req.params.username,
      resource: "superuser",
      action: "access",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}
