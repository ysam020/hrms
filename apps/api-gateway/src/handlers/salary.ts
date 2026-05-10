import { Request, Response } from "express";
import { salaryClient, grpcCall } from "../grpc/clients";
import { prisma } from "@hrms/db";
import { AuthRequest } from "../middleware/authenticate";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";

async function resolveUsername(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, isSuperUser: true },
  });
  return user ? user.username : null;
}

async function isSuperUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true },
  });
  return user?.isSuperUser === true;
}

export async function updateSalary(req: Request, res: Response) {
  try {
    const { userId, basicSalary, components, effectiveDate, createdBy } =
      req.body;
    const response = await grpcCall(salaryClient, "updateSalaryStructure", {
      userId: userId || "",
      basicSalary: Number(basicSalary) || 0,
      components: Array.isArray(components) ? components : [],
      effectiveDate: effectiveDate || "",
      createdBy: createdBy || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("updateSalary error:", { error });
    return handleError(res, error);
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

    const response = await grpcCall(salaryClient, "getPayslip", {
      username: requestedUsername,
      year: parseInt(String(req.params.year)),
      month: parseInt(String(req.params.month)),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("getUserSalary error:", { error });
    return handleError(res, error);
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

    const response = await grpcCall(salaryClient, "getPayslip", {
      username: requestedUsername,
      year: parseInt(String(req.params.year)),
      month: parseInt(String(req.params.month)),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("generateSalarySlip error:", { error });
    return handleError(res, error);
  }
}
