import { Request, Response } from "express";
import { employeeClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { cacheManager } from "@hrms/cache";
import { parsePagination } from "../utils/pagination";
import { handleError } from "../utils/handleError";
import { safeDecrypt } from "@hrms/crypto";

export async function editEmployeeDetails(req: Request, res: Response) {
  try {
    const {
      username,
      assets,
      employeeStatus,
      pf_no,
      uan_no,
      esic_no,
      reasonForTermination,
      dateOfTermination,
      dateOfAbscond,
      wfh,
      wfhHomeLatitude,
      wfhHomeLongitude,
      wfhHomeName,
      employmentType,
      workState,
    } = req.body;

    const targetUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!targetUser) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Employee not found",
      });
    }

    const updateData: Record<string, any> = {};

    if (assets !== undefined) updateData.assets = assets;
    if (employeeStatus !== undefined)
      updateData.employeeStatus = employeeStatus;
    if (pf_no !== undefined) updateData.pf_no = pf_no;
    if (uan_no !== undefined) updateData.uan_no = uan_no;
    if (esic_no !== undefined) updateData.esic_no = esic_no;
    if (wfh !== undefined) updateData.wfh = wfh;
    if (wfhHomeLatitude !== undefined)
      updateData.wfhHomeLatitude = wfhHomeLatitude ?? null;
    if (wfhHomeLongitude !== undefined)
      updateData.wfhHomeLongitude = wfhHomeLongitude ?? null;
    if (wfhHomeName !== undefined) updateData.wfhHomeName = wfhHomeName ?? null;
    if (reasonForTermination !== undefined)
      updateData.reasonForTermination = reasonForTermination;
    if (dateOfTermination !== undefined)
      updateData.dateOfTermination = dateOfTermination
        ? new Date(dateOfTermination)
        : null;
    if (dateOfAbscond !== undefined)
      updateData.dateOfAbscond = dateOfAbscond ? new Date(dateOfAbscond) : null;
    if (employmentType !== undefined)
      updateData.employmentType = employmentType;
    if (workState !== undefined) updateData.workState = workState ?? null;

    await prisma.user.update({
      where: { id: targetUser.id },
      data: updateData,
    });

    const tenantId = getTenantId() ?? "global";
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:employees:*`),
      cacheManager.delete(`t:${tenantId}:employee:${targetUser.id}`),
      cacheManager.delete(`t:${tenantId}:employee-details:${username}`),
      cacheManager.delete(`t:${tenantId}:dashboard:employee-insights`),
    ]);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Employee details updated successfully",
    });
  } catch (error: unknown) {
    logger.error("PUT /edit-employee-details error:", { error });
    return handleError(res, error);
  }
}

export async function getEmployeeDetails(req: Request, res: Response) {
  try {
    const username = req.params.username as string;
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:employee-details:${username}`;

    const cached = await cacheManager.get<any>(cacheKey);
    if (cached) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Employee details fetched",
        data: cached,
      });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        assets: true,
        employeeStatus: true,
        wfh: true,
        wfhHomeLatitude: true,
        wfhHomeLongitude: true,
        wfhHomeName: true,
        pf_no: true,
        uan_no: true,
        esic_no: true,
        salary: true,
        salaryBasicPay: true,
        salaryHra: true,
        salaryConveyance: true,
        salaryPf: true,
        salaryEsi: true,
        salaryPt: true,
        salaryComponentBreakdown: true,
        reasonForTermination: true,
        dateOfTermination: true,
        dateOfAbscond: true,
        isSuperUser: true,
        employmentType: true,
        workState: true,
      },
    });

    if (!user) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Employee not found",
      });
    }

    const data = {
      ...user,
      pf_no: safeDecrypt(user.pf_no),
      uan_no: safeDecrypt(user.uan_no),
      esic_no: safeDecrypt(user.esic_no),
      salaryStructure: {
        basicPay: user.salaryBasicPay,
        hra: user.salaryHra,
        conveyance: user.salaryConveyance,
        pf: user.salaryPf,
        esi: user.salaryEsi,
        pt: user.salaryPt,
        components: user.salaryComponentBreakdown ?? [],
      },
    };

    await cacheManager.set(cacheKey, data, "employee");

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Employee details fetched",
      data,
    });
  } catch (error: unknown) {
    logger.error("GET /get-employee-details/:username error:", { error });
    return handleError(res, error);
  }
}

export async function employeeInsights(_req: Request, res: Response) {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:dashboard:employee-insights`;
    const cached = await cacheManager.get<any>(cacheKey);
    if (cached) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Employee insights fetched",
        data: cached,
      });
    }

    const [active, resigned, terminated, absconded, total, deptGroups] =
      await Promise.all([
        prisma.user.count({ where: { employeeStatus: "Active" } }),
        prisma.user.count({ where: { employeeStatus: "Resigned" } }),
        prisma.user.count({ where: { employeeStatus: "Terminated" } }),
        prisma.user.count({ where: { employeeStatus: "Absconded" } }),
        prisma.user.count(),
        prisma.user.groupBy({
          by: ["department"],
          where: { department: { not: null }, employeeStatus: "Active" },
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
        }),
      ]);
    const departmentBreakdown = deptGroups
      .filter((g: any) => g.department)
      .map((g: any) => ({
        department: g.department!,
        count: g._count.id,
        activeCount: g._count.id,
      }));
    const data = {
      overview: {
        activeEmployees: active,
        resignedEmployees: resigned,
        terminatedEmployees: terminated,
        abscondedEmployees: absconded,
        totalEmployees: total,
      },
      departmentBreakdown,
    };
    await cacheManager.set(cacheKey, data, "dashboard");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Employee insights fetched",
      data,
    });
  } catch (error: unknown) {
    logger.error("employee-insights error:", { error });
    return handleError(res, error);
  }
}

/**
 * Owners/admins/HR and superusers can always manage KYC for anyone; anyone
 * else needs the specific granular BasicKYCDetails permission for the
 * action, matching the "module:action:scope" strings the permissions editor
 * writes (see apps/web/.../PermissionBitmask.tsx) — checked directly against
 * the stored string array rather than via a scope-unaware substring match.
 */
// Once a KYC has been decided (Approved) or is mid-review (Edit Requested,
// awaiting HR's grant), it's not directly editable — the employee must go
// through requestKycEditAccess and have HR allowKycEdit it back to Pending
// first. "Rejected" is a legacy terminal status (the reject action itself
// has been removed) with no further path.
const UNEDITABLE_KYC_STATUSES = ["Approved", "Rejected", "Edit Requested"];

async function canManageKyc(
  req: AuthRequest,
  action: "edit_kyc" | "approve_kyc" | "request_kyc_revision",
): Promise<boolean> {
  const { userId, tenantRole } = req.user!;
  if (["owner", "admin", "hr"].includes(tenantRole ?? "")) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true, permissions: true },
  });
  if (user?.isSuperUser) return true;
  const permissions = (user?.permissions as string[]) ?? [];
  return permissions.includes(`BasicKYCDetails:${action}:all`);
}

function toKycGrpcPayload(body: Record<string, any>) {
  return {
    employeePhoto: body.employee_photo,
    dob: body.dob,
    bloodGroup: body.blood_group,
    qualification: body.qualification,
    mobile: body.mobile,
    email: body.email,
    officialEmail: body.official_email,
    permanentAddressLine1: body.permanent_address_line_1,
    permanentAddressLine2: body.permanent_address_line_2,
    permanentAddressCity: body.permanent_address_city,
    permanentAddressState: body.permanent_address_state,
    permanentAddressPincode: body.permanent_address_pincode,
    communicationAddressLine1: body.communication_address_line_1,
    communicationAddressLine2: body.communication_address_line_2,
    communicationAddressCity: body.communication_address_city,
    communicationAddressState: body.communication_address_state,
    communicationAddressPincode: body.communication_address_pincode,
    aadharNo: body.aadhar_no,
    aadharPhotoFront: body.aadhar_photo_front,
    aadharPhotoBack: body.aadhar_photo_back,
    panNo: body.pan_no,
    panPhoto: body.pan_photo,
    educationCertificates: body.education_certificates,
    experienceCertificate: body.experience_certificate,
    electricityBill: body.electricity_bill,
    bankAccountNo: body.bank_account_no,
    bankName: body.bank_name,
    ifscCode: body.ifsc_code,
  };
}

export async function completeKyc(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await grpcCall(employeeClient, "submitKyc", {
      userId: user!.userId,
      ...toKycGrpcPayload(req.body),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("completeKyc error:", { error });
    return handleError(res, error);
  }
}

export async function editKyc(req: AuthRequest, res: Response) {
  try {
    const { username } = req.body;
    if (!username) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "username is required",
      });
    }
    const targetUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true, kyc_approval: true, kyc_edit_window: true },
    });
    if (!targetUser) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Employee not found",
      });
    }
    // A granted edit-access request allows exactly one edit — submitKyc
    // flips kyc_edit_window to "closed" the moment that edit lands, so a
    // still-Pending record can be uneditable again without ever leaving
    // the Pending status (which onboarding relies on staying editable).
    const editWindowClosed =
      targetUser.kyc_approval === "Pending" &&
      targetUser.kyc_edit_window === "closed";
    if (
      UNEDITABLE_KYC_STATUSES.includes(targetUser.kyc_approval ?? "") ||
      editWindowClosed
    ) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          targetUser.kyc_approval === "Edit Requested"
            ? "Waiting for approver..."
            : editWindowClosed
              ? "You've already made your allowed edit. Request edit access again to make further changes."
              : "This KYC has already been finalized. Request edit access to make changes.",
      });
    }
    const isSelf = targetUser.id === req.user!.userId;
    if (!isSelf && !(await canManageKyc(req, "edit_kyc"))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You can only edit your own KYC details.",
      });
    }
    const response = await grpcCall(employeeClient, "submitKyc", {
      // Passing userId (like completeKyc always does) is the signal
      // submitKyc uses to tell "the employee is resubmitting their own KYC"
      // apart from "HR is correcting a field on someone else's record" — the
      // latter must not silently discard an existing Revision Requested
      // decision. See submitKyc.ts's shouldResetToPending.
      ...(isSelf ? { userId: targetUser.id } : { username }),
      ...toKycGrpcPayload(req.body),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("editKyc error:", { error });
    return handleError(res, error);
  }
}

export async function kycApproval(req: AuthRequest, res: Response) {
  try {
    const { username, kyc_approval, field_issues } = req.body;
    if (!username)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "username is required",
      });
    if (!kyc_approval)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "kyc_approval is required",
      });
    if (!["Approved", "Revision Requested"].includes(kyc_approval)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: 'kyc_approval must be "Approved" or "Revision Requested"',
      });
    }

    const isApproval = kyc_approval === "Approved";
    const action = isApproval ? "approve_kyc" : "request_kyc_revision";
    if (!(await canManageKyc(req, action))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: `You don't have permission to ${action.replace(/_/g, " ")}.`,
      });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    if (!isApproval) {
      const response = await grpcCall(employeeClient, "requestKycRevision", {
        employeeId: user.id,
        fieldIssuesJson: JSON.stringify(field_issues ?? {}),
      });
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
    }

    const response = await grpcCall(employeeClient, "approveKyc", {
      employeeId: user.id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("kycApproval error:", { error });
    return handleError(res, error);
  }
}

/** POST /request-kyc-edit-access — self-only: ask HR to reopen an approved KYC. */
export async function requestKycEditAccess(req: AuthRequest, res: Response) {
  try {
    const { reason } = req.body;
    const response = await grpcCall(employeeClient, "requestKycEditAccess", {
      userId: req.user!.userId,
      reason,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("requestKycEditAccess error:", { error });
    return handleError(res, error);
  }
}

/** PUT /allow-kyc-edit — HR grants a pending edit-access request. */
export async function allowKycEdit(req: AuthRequest, res: Response) {
  try {
    const { username } = req.body;
    if (!username) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "username is required",
      });
    }
    if (!(await canManageKyc(req, "request_kyc_revision"))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You don't have permission to allow KYC edits.",
      });
    }
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const response = await grpcCall(employeeClient, "allowKycEdit", {
      employeeId: user.id,
      actorUserId: req.user!.userId,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("allowKycEdit error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /kyc-approvals/pending — feeds the dashboard's Pending Approvals
 * widget, the sidebar badge, and the /approvals inbox, alongside
 * GET /approvals/pending. Two independent categories, each gated by its own
 * permission (a caller can hold one without the other):
 *  - "Pending": a fresh/resubmitted KYC awaiting approve_kyc's decision
 *    (see submitKyc.ts).
 *  - "Edit Requested": an already-Approved KYC's edit-access request
 *    awaiting request_kyc_revision's grant (see allowKycEdit.ts).
 * Neither is modeled through the approval-chain engine (any of several
 * eligible approvers can act, not a single resolved approver per step), so
 * this stays a lightweight, purpose-built query rather than a chain
 * instance. A caller with neither permission gets an empty list rather
 * than 403, since every logged-in user's dashboard/badge/inbox calls this
 * unconditionally.
 */
export async function listPendingKycActions(req: AuthRequest, res: Response) {
  try {
    const [canApprove, canGrantEdit] = await Promise.all([
      canManageKyc(req, "approve_kyc"),
      canManageKyc(req, "request_kyc_revision"),
    ]);
    if (!canApprove && !canGrantEdit) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: [] });
    }

    const [pendingSubmissions, editRequests] = await Promise.all([
      canApprove
        ? prisma.user.findMany({
            where: { kyc_approval: "Pending" },
            select: {
              id: true,
              username: true,
              first_name: true,
              last_name: true,
              kyc_date: true,
            },
            orderBy: { kyc_date: "desc" },
          })
        : Promise.resolve([]),
      canGrantEdit
        ? prisma.user.findMany({
            where: { kyc_approval: "Edit Requested" },
            select: {
              id: true,
              username: true,
              first_name: true,
              last_name: true,
              kyc_edit_request_reason: true,
              kyc_edit_requested_at: true,
            },
            orderBy: { kyc_edit_requested_at: "desc" },
          })
        : Promise.resolve([]),
    ]);

    const data = [
      ...pendingSubmissions.map((u) => ({
        instanceId: `kyc:${u.id}`,
        module: "kyc",
        kycAction: "approve" as const,
        username: u.username,
        requestedByName:
          [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username,
        createdAt: u.kyc_date,
        summary: `${u.username} submitted their KYC form for approval`,
      })),
      ...editRequests.map((u) => ({
        instanceId: `kyc:${u.id}`,
        module: "kyc",
        kycAction: "allow_edit" as const,
        username: u.username,
        requestedByName:
          [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username,
        createdAt: u.kyc_edit_requested_at,
        summary: `${u.username} requested to edit their approved KYC${
          u.kyc_edit_request_reason ? `: ${u.kyc_edit_request_reason}` : ""
        }`,
      })),
    ];

    // Latest first — each category is independently sorted above, but
    // concatenating "Pending" submissions and "Edit Requested" items
    // doesn't interleave the two by date on its own.
    data.sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime(),
    );

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (error: unknown) {
    logger.error("listPendingKycActions error:", { error });
    return handleError(res, error);
  }
}

export async function viewAllKycs(req: Request, res: Response) {
  try {
    const { page, limit } = parsePagination(req.query, 10);
    const skip = (page - 1) * limit;

    const tenantId = getTenantId();
    if (!tenantId) {
      logger.error("view-all-kycs error: no tenant context on request");
      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
    const match: any = {
      employeeStatus: "Active",
      tenantId: { $oid: tenantId },
    };
    if (req.query.search) {
      // Escape special regex characters to prevent ReDoS
      const escaped = String(req.query.search).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      match.$or = [
        { username: { $regex: escaped, $options: "i" } },
        { first_name: { $regex: escaped, $options: "i" } },
        { last_name: { $regex: escaped, $options: "i" } },
        { department: { $regex: escaped, $options: "i" } },
        { designation: { $regex: escaped, $options: "i" } },
      ];
    }
    if (req.query.status && req.query.status !== "All") {
      match.kyc_approval = req.query.status;
    }

    const [rows, countRows] = await Promise.all([
      prisma.user.aggregateRaw({
        pipeline: [
          { $match: match },
          { $sort: { first_name: 1, last_name: 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              username: 1,
              first_name: 1,
              middle_name: 1,
              last_name: 1,
              department: 1,
              designation: 1,
              employeeStatus: 1,
              joiningDate: 1,
              kyc_approval: 1,
              kyc_date: 1,
            },
          },
        ],
      }),
      prisma.user.aggregateRaw({
        pipeline: [{ $match: match }, { $count: "total" }],
      }) as any,
    ]);

    const totalCount = (countRows as any[])[0]?.total ?? 0;

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "KYC list fetched",
      data: {
        kycs: rows,
        pagination: {
          totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error: unknown) {
    logger.error("view-all-kycs error:", { error });
    return handleError(res, error);
  }
}

export async function getKycInsights(_req: Request, res: Response) {
  try {
    const kycTenantId = getTenantId();
    if (!kycTenantId) {
      logger.error("get-kyc-insights error: no tenant context on request");
      return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
        message: "Internal Server Error",
      });
    }
    const rows = (await prisma.user.aggregateRaw({
      pipeline: [
        { $match: { tenantId: { $oid: kycTenantId } } },
        {
          $group: {
            _id: null,
            approved: {
              $sum: { $cond: [{ $eq: ["$kyc_approval", "Approved"] }, 1, 0] },
            },
            pending: {
              $sum: { $cond: [{ $eq: ["$kyc_approval", "Pending"] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ["$kyc_approval", "Rejected"] }, 1, 0] },
            },
            total: { $sum: 1 },
          },
        },
      ],
    })) as unknown as any[];
    const stats = rows[0] ?? { approved: 0, pending: 0, rejected: 0, total: 0 };
    const completionRate =
      stats.total > 0 ? (stats.approved / stats.total) * 100 : 0;
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "KYC insights fetched",
      data: {
        overview: {
          approvedKyc: stats.approved,
          pendingKyc: stats.pending,
          rejectedKyc: stats.rejected,
          completionRate,
          totalEmployees: stats.total,
        },
      },
    });
  } catch (error: unknown) {
    logger.error("get-kyc-insights error:", { error });
    return handleError(res, error);
  }
}
