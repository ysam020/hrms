import { Request, Response } from "express";
import { z } from "zod";
import { employeeCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS, errorMessage } from "@hrms/common";
import { cacheManager } from "@hrms/cache";
import { validateBody } from "../middleware/validate";
import { resolveUserId } from "../utils/userHelpers";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const editEmployeeSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  middleName: z.string().max(100).optional(),
  dob: z.string().max(20).optional(),
  blood_group: z.string().max(10).optional(),
  mobile: z.string().max(20).optional(),
  official_email: z.string().email().max(200).optional(),
  designation: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  communication_address_line_1: z.string().max(300).optional(),
  communication_address_line_2: z.string().max(300).optional(),
  communication_address_city: z.string().max(100).optional(),
  communication_address_state: z.string().max(100).optional(),
  communication_address_pincode: z.string().max(20).optional(),
  permanent_address_line_1: z.string().max(300).optional(),
  permanent_address_line_2: z.string().max(300).optional(),
  permanent_address_city: z.string().max(100).optional(),
  permanent_address_state: z.string().max(100).optional(),
  permanent_address_pincode: z.string().max(20).optional(),
  employee_photo: z.string().max(500).optional(),
  wfh: z.boolean().optional(),
  joiningDate: z.string().max(20).optional(),
});

const kycSchema = z.object({
  aadharNo: z.string().max(20).optional().default(""),
  aadharPhotoFront: z.string().max(500).optional().default(""),
  aadharPhotoBack: z.string().max(500).optional().default(""),
  panNo: z.string().max(20).optional().default(""),
  panPhoto: z.string().max(500).optional().default(""),
  bankAccountNo: z.string().max(30).optional().default(""),
  bankName: z.string().max(100).optional().default(""),
  ifscCode: z.string().max(15).optional().default(""),
  pfNo: z.string().max(30).optional().default(""),
  uanNo: z.string().max(30).optional().default(""),
  esicNo: z.string().max(30).optional().default(""),
});

const kycApprovalSchema = z.object({
  username: z.string().min(1).max(100),
  kyc_approval: z.enum(["Approved", "Rejected"]),
});

export const validateEditEmployee = validateBody(editEmployeeSchema);
export const validateKyc = validateBody(kycSchema);
export const validateKycApproval = validateBody(kycApprovalSchema);

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

    const response = await employeeCall("updateEmployee", {
      id: user!.userId,
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
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getEmployeeDetails(req: Request, res: Response) {
  try {
    const id = await resolveUserId(req.params.username);
    if (!id)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Employee not found",
      });
    const response = await employeeCall("getEmployee", { id });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
  } catch (error: any) {
    logger.error("employee-insights error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function completeKyc(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      aadharNo,
      aadharPhotoFront,
      aadharPhotoBack,
      panNo,
      panPhoto,
      bankAccountNo,
      bankName,
      ifscCode,
      pfNo,
      uanNo,
      esicNo,
    } = req.body;
    const response = await employeeCall("submitKyc", {
      userId: user!.userId,
      aadharNo,
      aadharPhotoFront,
      aadharPhotoBack,
      panNo,
      panPhoto,
      bankAccountNo,
      bankName,
      ifscCode,
      pfNo,
      uanNo,
      esicNo,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function editKyc(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      aadharNo,
      aadharPhotoFront,
      aadharPhotoBack,
      panNo,
      panPhoto,
      bankAccountNo,
      bankName,
      ifscCode,
      pfNo,
      uanNo,
      esicNo,
    } = req.body;
    const response = await employeeCall("submitKyc", {
      userId: user!.userId,
      aadharNo,
      aadharPhotoFront,
      aadharPhotoBack,
      panNo,
      panPhoto,
      bankAccountNo,
      bankName,
      ifscCode,
      pfNo,
      uanNo,
      esicNo,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function kycApproval(req: Request, res: Response) {
  try {
    const { username, kyc_approval } = req.body;

    if (!username || !kyc_approval) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "username and kyc_approval are required",
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

    const method = kyc_approval === "Approved" ? "approveKyc" : "rejectKyc";
    const response = await employeeCall(method, {
      employeeId: user.id,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function viewAllKycs(req: Request, res: Response) {
  try {
    const page = parseInt(String(req.query.page || "1"));
    const limit = Math.min(parseInt(String(req.query.limit || "10")), 100);
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
  } catch (error: any) {
    logger.error("view-all-kycs error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
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
  } catch (error: any) {
    logger.error("get-kyc-insights error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}
