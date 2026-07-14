import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { isSuperUser } from "../utils/user";
import { parsePagination } from "../utils/pagination";
import { getFinancialYear } from "../utils/tdsCalc";

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

function currentFinancialYear(): string {
  const now = new Date();
  return getFinancialYear(now.getMonth() + 1, now.getFullYear());
}

// Statuses an employee is free to (re)write their own declaration in.
const EDITABLE_STATUSES = ["Draft", "RevisionRequested"];

async function canManageTaxDeclaration(
  req: AuthRequest,
  action: "review_declaration" | "review_proofs",
): Promise<boolean> {
  const { userId, tenantRole } = req.user!;
  if (["owner", "admin", "hr"].includes(tenantRole ?? "")) return true;
  const superUser = await isSuperUser(userId);
  if (superUser) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });
  return (user?.permissions ?? []).includes(`TaxDeclaration:${action}:all`);
}

// ─── Employee self-service ──────────────────────────────────────────────────────

/** GET /tax-declarations/mine?financialYear=2025-26 — defaults to the current FY. */
export async function getMyDeclaration(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const financialYear =
      (req.query.financialYear as string) || currentFinancialYear();
    const declaration = await (prisma as any).taxDeclaration.findUnique({
      where: {
        tenantId_userId_financialYear: {
          tenantId,
          userId: req.user!.userId,
          financialYear,
        },
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: declaration ?? { status: null, financialYear },
    });
  } catch (error: unknown) {
    logger.error("getMyDeclaration error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /tax-declarations/draft — self-only. Creates (opting into Old Regime
 * for this FY) or freely edits the employee's own declaration while it's
 * still in an editable status. Does not advance the status.
 */
export async function saveDraftDeclaration(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { financialYear, monthlyRent, isMetroCity, lineItems } = req.body;
    const fy = financialYear || currentFinancialYear();
    const userId = req.user!.userId;

    const existing = await (prisma as any).taxDeclaration.findUnique({
      where: {
        tenantId_userId_financialYear: { tenantId, userId, financialYear: fy },
      },
    });
    if (existing && !EDITABLE_STATUSES.includes(existing.status)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `This declaration is ${existing.status} and can no longer be edited.`,
      });
    }

    const declaration = await (prisma as any).taxDeclaration.upsert({
      where: {
        tenantId_userId_financialYear: { tenantId, userId, financialYear: fy },
      },
      update: { monthlyRent, isMetroCity, lineItems },
      create: {
        tenantId,
        userId,
        financialYear: fy,
        monthlyRent,
        isMetroCity,
        lineItems,
        status: "Draft",
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Draft saved.",
      data: declaration,
    });
  } catch (error: unknown) {
    logger.error("saveDraftDeclaration error:", { error });
    return handleError(res, error);
  }
}

/** POST /tax-declarations/submit — self-only. Draft/RevisionRequested → Submitted. */
export async function submitDeclaration(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const financialYear = req.body.financialYear || currentFinancialYear();
    const userId = req.user!.userId;
    const existing = await (prisma as any).taxDeclaration.findUnique({
      where: {
        tenantId_userId_financialYear: { tenantId, userId, financialYear },
      },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Save a draft before submitting.",
      });
    }
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `This declaration is already ${existing.status}.`,
      });
    }
    const declaration = await (prisma as any).taxDeclaration.update({
      where: { id: existing.id },
      data: {
        status: "Submitted",
        submittedAt: new Date(),
        revisionNotes: null,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Declaration submitted for review.",
      data: declaration,
    });
  } catch (error: unknown) {
    logger.error("submitDeclaration error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /tax-declarations/proofs — self-only. Declared/ProofRevisionRequested →
 * ProofsSubmitted. `proofs` is a {code: proofAmount} map merged into the
 * existing lineItems (proof docs themselves are uploaded via the existing
 * generic file-upload endpoint and their URLs passed in as part of lineItems).
 */
export async function submitDeclarationProofs(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { financialYear: fyBody, proofs } = req.body;
    const financialYear = fyBody || currentFinancialYear();
    const userId = req.user!.userId;
    const existing = await (prisma as any).taxDeclaration.findUnique({
      where: {
        tenantId_userId_financialYear: { tenantId, userId, financialYear },
      },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "No declaration found for that financial year.",
      });
    }
    if (!["Declared", "ProofRevisionRequested"].includes(existing.status)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "Proofs can only be submitted once your declaration has been approved.",
      });
    }
    const lineItems = (
      Array.isArray(existing.lineItems) ? existing.lineItems : []
    ).map((item: any) =>
      proofs && Object.prototype.hasOwnProperty.call(proofs, item.code)
        ? { ...item, proofAmount: proofs[item.code] }
        : item,
    );
    const declaration = await (prisma as any).taxDeclaration.update({
      where: { id: existing.id },
      data: {
        lineItems,
        status: "ProofsSubmitted",
        provenAt: new Date(),
        revisionNotes: null,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Proofs submitted for verification.",
      data: declaration,
    });
  } catch (error: unknown) {
    logger.error("submitDeclarationProofs error:", { error });
    return handleError(res, error);
  }
}

// ─── HR review ──────────────────────────────────────────────────────────────────

/**
 * POST /tax-declarations/review — HR-only. Submitted → Declared, or →
 * RevisionRequested with notes (dispatches on body.decision, mirrors kycApproval).
 */
export async function reviewDeclaration(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await canManageTaxDeclaration(req, "review_declaration"))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "You don't have permission to review tax declarations.",
    });
  }
  try {
    const { userId, financialYear, decision, revisionNotes } = req.body;
    if (!["Declared", "RevisionRequested"].includes(decision)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: 'decision must be "Declared" or "RevisionRequested"',
      });
    }
    const existing = await (prisma as any).taxDeclaration.findUnique({
      where: {
        tenantId_userId_financialYear: { tenantId, userId, financialYear },
      },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Declaration not found.",
      });
    }
    if (existing.status !== "Submitted") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `This declaration is ${existing.status}, not awaiting review.`,
      });
    }
    const declaration = await (prisma as any).taxDeclaration.update({
      where: { id: existing.id },
      data:
        decision === "Declared"
          ? { status: "Declared", declaredAt: new Date(), revisionNotes: null }
          : { status: "RevisionRequested", revisionNotes: revisionNotes ?? {} },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message:
        decision === "Declared"
          ? "Declaration approved."
          : "Revision requested.",
      data: declaration,
    });
  } catch (error: unknown) {
    logger.error("reviewDeclaration error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /tax-declarations/review-proofs — HR-only. ProofsSubmitted → Verified,
 * or → ProofRevisionRequested with notes.
 */
export async function reviewDeclarationProofs(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await canManageTaxDeclaration(req, "review_proofs"))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "You don't have permission to review declaration proofs.",
    });
  }
  try {
    const { userId, financialYear, decision, revisionNotes } = req.body;
    if (!["Verified", "ProofRevisionRequested"].includes(decision)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: 'decision must be "Verified" or "ProofRevisionRequested"',
      });
    }
    const existing = await (prisma as any).taxDeclaration.findUnique({
      where: {
        tenantId_userId_financialYear: { tenantId, userId, financialYear },
      },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Declaration not found.",
      });
    }
    if (existing.status !== "ProofsSubmitted") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `This declaration is ${existing.status}, not awaiting proof review.`,
      });
    }
    const declaration = await (prisma as any).taxDeclaration.update({
      where: { id: existing.id },
      data:
        decision === "Verified"
          ? {
              status: "Verified",
              verifiedAt: new Date(),
              verifiedBy: req.user!.userId,
              revisionNotes: null,
            }
          : {
              status: "ProofRevisionRequested",
              revisionNotes: revisionNotes ?? {},
            },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message:
        decision === "Verified"
          ? "Proofs verified."
          : "Proof revision requested.",
      data: declaration,
    });
  } catch (error: unknown) {
    logger.error("reviewDeclarationProofs error:", { error });
    return handleError(res, error);
  }
}

/** GET /tax-declarations/:userId?financialYear= — HR detail/review view for one employee. */
export async function getDeclarationForReview(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  const [canReviewDeclaration, canReviewProofs] = await Promise.all([
    canManageTaxDeclaration(req, "review_declaration"),
    canManageTaxDeclaration(req, "review_proofs"),
  ]);
  if (!canReviewDeclaration && !canReviewProofs) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "You don't have permission to view tax declarations.",
    });
  }
  try {
    const { userId } = req.params as { userId: string };
    const financialYear =
      (req.query.financialYear as string) || currentFinancialYear();
    const [declaration, employee] = await Promise.all([
      (prisma as any).taxDeclaration.findUnique({
        where: {
          tenantId_userId_financialYear: { tenantId, userId, financialYear },
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, first_name: true, last_name: true },
      }),
    ]);
    if (!declaration) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "No declaration found for that financial year.",
      });
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { ...declaration, employee },
    });
  } catch (error: unknown) {
    logger.error("getDeclarationForReview error:", { error });
    return handleError(res, error);
  }
}

/** GET /tax-declarations?financialYear=&status= — HR list, paginated. */
export async function listDeclarations(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await canManageTaxDeclaration(req, "review_declaration"))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "You don't have permission to view tax declarations.",
    });
  }
  try {
    const { page, limit } = parsePagination(req.query, 10);
    const financialYear =
      (req.query.financialYear as string) || currentFinancialYear();
    const where: Record<string, unknown> = { tenantId, financialYear };
    if (req.query.status && req.query.status !== "All") {
      where.status = req.query.status;
    }

    const [rows, total] = await Promise.all([
      (prisma as any).taxDeclaration.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (prisma as any).taxDeclaration.count({ where }),
    ]);

    const users = await prisma.user.findMany({
      where: { id: { in: rows.map((r: any) => r.userId) } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    const data = rows.map((r: any) => ({
      ...r,
      employee: userById.get(r.userId),
    }));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data,
      pagination: { page, limit, total },
    });
  } catch (error: unknown) {
    logger.error("listDeclarations error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /tax-declarations/pending — feeds HR's review queue: declarations
 * awaiting the declare-stage decision plus ones awaiting the proof-stage
 * decision, each gated by its own permission (mirrors getPendingKycItems).
 */
export async function getPendingDeclarationActions(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const [canReviewDeclaration, canReviewProofs] = await Promise.all([
      canManageTaxDeclaration(req, "review_declaration"),
      canManageTaxDeclaration(req, "review_proofs"),
    ]);
    const financialYear = currentFinancialYear();
    const [pendingDeclarations, pendingProofs] = await Promise.all([
      canReviewDeclaration
        ? (prisma as any).taxDeclaration.findMany({
            where: { tenantId, financialYear, status: "Submitted" },
            orderBy: { submittedAt: "desc" },
          })
        : Promise.resolve([]),
      canReviewProofs
        ? (prisma as any).taxDeclaration.findMany({
            where: { tenantId, financialYear, status: "ProofsSubmitted" },
            orderBy: { provenAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    const rows = [...pendingDeclarations, ...pendingProofs];
    const users = await prisma.user.findMany({
      where: { id: { in: rows.map((r: any) => r.userId) } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const data = rows
      .map((r: any) => {
        const u = userById.get(r.userId);
        const name = u
          ? [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username
          : "Unknown";
        const stage = r.status === "Submitted" ? "declaration" : "proofs";
        return {
          instanceId: `tax-declaration:${r.id}`,
          userId: r.userId,
          financialYear: r.financialYear,
          stage,
          username: u?.username,
          requestedByName: name,
          createdAt: r.status === "Submitted" ? r.submittedAt : r.provenAt,
          summary: `${name} submitted ${stage === "declaration" ? "an Old Regime tax declaration" : "proofs"} for FY ${r.financialYear}`,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      );

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (error: unknown) {
    logger.error("getPendingDeclarationActions error:", { error });
    return handleError(res, error);
  }
}
