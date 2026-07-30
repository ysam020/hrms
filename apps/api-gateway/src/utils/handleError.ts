import { Response } from "express";
import { Prisma } from "@prisma/client";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

/**
 * For call sites wrapping business-logic helpers (e.g. actOnApprovalForEntity)
 * that signal a client-facing validation/authorization failure by throwing a
 * plain `Error` with just a message — as opposed to a Prisma error or one
 * that already carries `.httpStatus` — which handleError alone would map to
 * a generic 500. Falls through to handleError for anything else.
 */
export function handleActionError(
  res: Response,
  err: unknown,
  clientErrorStatus: number = RESPONSE_STATUS.BAD_REQUEST,
): Response {
  const anyErr = err as any;
  if (
    anyErr?.message &&
    !anyErr?.code &&
    !(err instanceof Prisma.PrismaClientKnownRequestError)
  ) {
    return apiResponse(res, clientErrorStatus, { message: anyErr.message });
  }
  return handleError(res, err);
}

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

  // Razorpay SDK errors: { statusCode, error: { code, description } }. Without
  // this, any Razorpay rejection (invalid state transition, unsupported
  // payment mode, etc.) silently flattens into a generic 500 with no
  // indication of what actually went wrong.
  if (typeof anyErr?.statusCode === "number" && anyErr?.error?.description) {
    return apiResponse(res, anyErr.statusCode, {
      message: anyErr.error.description,
    });
  }

  return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
    message: "Internal Server Error",
  });
}
