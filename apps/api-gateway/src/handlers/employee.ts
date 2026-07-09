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
        reasonForTermination: true,
        dateOfTermination: true,
        dateOfAbscond: true,
        isSuperUser: true,
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

export async function editKyc(req: Request, res: Response) {
  try {
    const { username } = req.body;
    if (!username) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "username is required",
      });
    }
    const response = await grpcCall(employeeClient, "submitKyc", {
      username,
      ...toKycGrpcPayload(req.body),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("editKyc error:", { error });
    return handleError(res, error);
  }
}

export async function kycApproval(req: Request, res: Response) {
  try {
    const { username, kyc_approval } = req.body;
    if (!username)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "username is required",
      });
    if (!kyc_approval)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "kyc_approval is required",
      });

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const method = kyc_approval === "Approved" ? "approveKyc" : "rejectKyc";
    const response = await grpcCall(employeeClient, method, {
      employeeId: user.id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("kycApproval error:", { error });
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
    const match: any = { employeeStatus: "Active", tenantId: { $oid: tenantId } };
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
