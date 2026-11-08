import { Response } from "express";
import { Prisma } from "@prisma/client";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";

// Set by @hrms/logger on every Error it writes (see wasLogged there); read
// through the global symbol registry so this check needs no import.
const LOGGED = Symbol.for("hrms.logger.logged");
const wasLogged = (err: unknown) =>
  !!err && typeof err === "object" && (err as any)[LOGGED] === true;

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

  // An unexpected error: the client gets a generic message, so the details
  // must be logged — unless the call site already did (most log first, and
  // the logger marks each error it writes). Logged with the route pattern
  // and the path without its query string (which can carry tokens); the
  // logger adds the request id and redacts sensitive values.
  if (!wasLogged(err)) {
    const req = res.req;
    logger.error("Unhandled error returned as 500", {
      err,
      service: "api-gateway",
      method: req?.method,
      route: req?.route?.path
        ? `${req.baseUrl ?? ""}${req.route.path}`
        : undefined,
      path: req?.originalUrl?.split("?")[0],
    });
  }
  return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
    message: "Internal Server Error",
  });
}
