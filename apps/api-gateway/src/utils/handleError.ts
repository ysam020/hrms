import { Response } from "express";
import { Prisma } from "@prisma/client";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

export function handleError(res: Response, err: unknown): Response {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
          message: "A record with this data already exists",
        });
      case "P2025":
        return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
          message: "Record not found",
        });
      case "P2003":
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: "Invalid reference data",
        });
    }
  }

  const anyErr = err as any;
  if (anyErr?.httpStatus) {
    return apiResponse(res, anyErr.httpStatus, {
      message: anyErr.message || "Service error",
    });
  }

  return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
    message: "Internal Server Error",
  });
}
