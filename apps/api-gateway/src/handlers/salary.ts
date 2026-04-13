import { Request, Response } from "express";
import { z } from "zod";
import { salaryCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { apiResponse, RESPONSE_STATUS, errorMessage } from "@hrms/common";
import { validateBody } from "../middleware/validate";
import { resolveUsername, isSuperUser } from "../utils/userHelpers";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const salaryComponentSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().min(0),
  type: z.string().max(50).optional(),
});

const updateSalarySchema = z.object({
  userId: z.string().min(1).max(100),
  basicSalary: z.number().min(0),
  components: z.array(salaryComponentSchema).optional().default([]),
  effectiveDate: z.string().max(50).optional().default(""),
  createdBy: z.string().max(100).optional().default(""),
});

export const validateUpdateSalary = validateBody(updateSalarySchema);

export async function updateSalary(req: Request, res: Response) {
  try {
    const { userId, basicSalary, components, effectiveDate, createdBy } =
      req.body;
    const response = await salaryCall("updateSalaryStructure", {
      userId: userId || "",
      basicSalary: Number(basicSalary) || 0,
      components: Array.isArray(components) ? components : [],
      effectiveDate: effectiveDate || "",
      createdBy: createdBy || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getUserSalary(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const requestedUsername = req.params.username;
    const ownUsername = await resolveUsername(user!.userId);
    const superUser = await isSuperUser(user!.userId);

    // Non-superusers can only access their own payslip
    if (!superUser && requestedUsername !== ownUsername) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const response = await salaryCall("getPayslip", {
      username: requestedUsername,
      year: parseInt(String(req.params.year)),
      month: parseInt(String(req.params.month)),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function generateSalarySlip(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const requestedUsername = req.params.username;
    const ownUsername = await resolveUsername(user!.userId);
    const superUser = await isSuperUser(user!.userId);

    if (!superUser && requestedUsername !== ownUsername) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const response = await salaryCall("getPayslip", {
      username: requestedUsername,
      year: parseInt(String(req.params.year)),
      month: parseInt(String(req.params.month)),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}
