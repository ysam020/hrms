import { Request, Response } from "express";
import { salary } from "@hrms/proto";
import { userClient, salaryClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { camelToSnake, apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { parsePagination, PAGINATION } from "../utils/pagination";
import { handleError } from "../utils/handleError";
import { isHrOrAboveCaller } from "../utils/user";

export async function getAllUsers(req: Request, res: Response) {
  try {
    const response = await grpcCall(userClient, "listUsers", {
      ...parsePagination(
        req.query,
        PAGINATION.DEFAULT_LIMIT_LARGE,
        PAGINATION.MAX_LIMIT_LARGE,
      ),
      search: req.query.search || "",
      role: req.query.role || "",
      department: req.query.department || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("GET /users error:", { error });
    return handleError(res, error);
  }
}

export async function getUserData(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = (await grpcCall(userClient, "getUser", {
      userId: req.params.username,
    })) as any;
    if (!response.data)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);

    const u = response.data;
    const snake = camelToSnake(u);
    snake.role = u.role ? u.role.split(",").filter(Boolean) : [];
    snake.isSuperUser = u.isSuperUser;
    snake.employeeStatus = u.employeeStatus;
    snake.dateOfTermination = u.dateOfTermination;
    snake.reasonForTermination = u.reasonForTermination;
    snake.dateOfAbscond = u.dateOfAbscond;

    // kyc_revision_notes travels over gRPC as a JSON string (see
    // user.proto's kycRevisionNotesJson) — surface it to the frontend as
    // the parsed { [fieldName]: issueDescription } object it actually is.
    delete snake.kyc_revision_notes_json;
    try {
      snake.kyc_revision_notes = u.kycRevisionNotesJson
        ? JSON.parse(u.kycRevisionNotesJson)
        : {};
    } catch {
      snake.kyc_revision_notes = {};
    }

    // Append salary fields (not in the user service proto) — sourced from
    // SalaryStructure (salary-service), not a denormalized User column. One
    // gRPC call for the single employee this request is about, no N+1 risk.
    const salaryResp: any = await grpcCall(
      salaryClient,
      "getSalaryStructure",
      // fromPartial zero-fills the omitted int32 year/month fields — a raw
      // object literal leaves them `undefined`, which the generated encoder
      // rejects with "invalid int32: undefined".
      salary.GetSalaryRequest.fromPartial({ userId: u.id }),
    );
    const salaryRow = salaryResp?.data;
    if (salaryRow) {
      snake.salary = salaryRow.grossEarnings;
      snake.salaryStructure = {
        basicPay: salaryRow.basicPay,
        hra: salaryRow.hra,
        conveyance: salaryRow.conveyance,
        pf: salaryRow.pf,
        esi: salaryRow.esi,
        pt: salaryRow.pt,
        components: salaryRow.components ?? [],
      };
    }

    // Work state now lives on the Tenant (set once during org setup) rather
    // than per employee — used for Professional Tax slab lookup in the
    // salary structure editor.
    const tenantId = getTenantId();
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { workState: true },
      });
      snake.workState = tenant?.workState ?? null;
    }

    // Strip PII/compensation data that only the owner or HR-and-above may
    // see. `u.id` is the target's real database id — `req.params.username`
    // is a username string, so comparing it directly against user.userId
    // (also a database id) would never match; resolve the owner check
    // against the fetched record's actual id instead.
    const callerIsOwner = user?.userId === u.id;
    if (!callerIsOwner) {
      const callerIsHrOrAbove = await isHrOrAboveCaller(
        user!.userId,
        user!.tenantRole,
      );
      if (!callerIsHrOrAbove) {
        delete snake.aadhar_no;
        delete snake.bank_account_no;
        delete snake.pan_no;
        delete snake.salary;
        delete snake.salaryStructure;
      }
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: response.message,
      status: response.status,
      data: snake,
    });
  } catch (error: unknown) {
    logger.error("GET /user-data error:", { error });
    return handleError(res, error);
  }
}

export async function saveFcmToken(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { fcmToken, deviceFingerprint, deviceInfo } = req.body;
    // Both are required for a meaningful registration — an empty token
    // can't receive pushes, and an empty/missing deviceFingerprint would
    // collide with any other request that also lacks one, since
    // registerFcmToken dedupes existing entries by deviceFingerprint.
    // Silently coercing either to "" here used to let a client-side bug
    // corrupt an existing device's entry instead of failing loudly.
    if (!fcmToken || !deviceFingerprint) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "fcmToken and deviceFingerprint are required",
      });
    }
    const response = await grpcCall(userClient, "registerFcmToken", {
      userId: user!.userId,
      token: fcmToken,
      deviceFingerprint,
      browser: deviceInfo?.browser || "",
      os: deviceInfo?.os || "",
      deviceType: deviceInfo?.deviceType || "",
      ipAddress: req.ip || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("POST /save-fcm-token error:", { error });
    return handleError(res, error);
  }
}

export async function disablePushNotifications(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { deviceFingerprint, disableAll } = req.body;
    const response = await grpcCall(userClient, "removeFcmToken", {
      userId: user!.userId,
      deviceFingerprint: deviceFingerprint || "",
      disableAll: !!disableAll,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("DELETE /disable-push-notifications error:", { error });
    return handleError(res, error);
  }
}

export async function checkFaceDescriptor(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const row = await prisma.user.findUnique({
      where: { id: user!.userId },
      select: { face_descriptor: true },
    });
    const descriptor = (row?.face_descriptor as number[] | null) ?? [];
    const hasDescriptor =
      Array.isArray(descriptor) && descriptor.length === 128;
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Face descriptor status fetched",
      data: {
        hasDescriptor,
        descriptor: hasDescriptor ? descriptor : null,
      },
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function saveFaceDescriptor(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { descriptor } = req.body;
    await prisma.user.update({
      where: { id: user!.userId },
      data: { face_descriptor: descriptor },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Face descriptor saved successfully",
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}
