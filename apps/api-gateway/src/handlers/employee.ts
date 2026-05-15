import { Request, Response } from "express";
import { employeeClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { cacheManager } from "@hrms/cache";
import { parsePagination } from "../utils/pagination";

export async function editEmployeeDetails(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    // Explicit allowlist — never forward isSuperUser, role, permissions, etc.
    const {
      firstName,
      lastName,
      middleName,
      dob,
      blood_group,
      mobile,
      official_email,
      designation,
      department,
      communication_address_line_1,
      communication_address_line_2,
      communication_address_city,
      communication_address_state,
      communication_address_pincode,
      permanent_address_line_1,
      permanent_address_line_2,
      permanent_address_city,
      permanent_address_state,
      permanent_address_pincode,
      employee_photo,
      wfh,
      joiningDate,
    } = req.body;

    const response = await grpcCall(employeeClient, "updateEmployee", {
      username: user!.userId,
      firstName,
      lastName,
      middleName,
      dob,
      blood_group,
      mobile,
      official_email,
      designation,
      department,
      communication_address_line_1,
      communication_address_line_2,
      communication_address_city,
      communication_address_state,
      communication_address_pincode,
      permanent_address_line_1,
      permanent_address_line_2,
      permanent_address_city,
      permanent_address_state,
      permanent_address_pincode,
      employee_photo,
      wfh,
      joiningDate,
    });
    // Department/designation changes affect analytics and dashboard caches
    if (
      department !== undefined ||
      designation !== undefined ||
      wfh !== undefined
    ) {
      await Promise.all([
        cacheManager.invalidatePattern("analytics:*"),
        cacheManager.delete("dashboard:employee-insights"),
      ]);
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function getEmployeeDetails(req: Request, res: Response) {
  try {
    const response = await grpcCall(employeeClient, "getEmployee", {
      username: req.params.username,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function employeeInsights(_req: Request, res: Response) {
  try {
    const cacheKey = "dashboard:employee-insights";
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function viewAllKycs(req: Request, res: Response) {
  try {
    const { page, limit } = parsePagination(req.query, 10);
    const skip = (page - 1) * limit;

    const match: any = { employeeStatus: "Active" };
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function getKycInsights(_req: Request, res: Response) {
  try {
    const rows = (await prisma.user.aggregateRaw({
      pipeline: [
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
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}
