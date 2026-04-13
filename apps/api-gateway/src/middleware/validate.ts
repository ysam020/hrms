import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

/**
 * Returns an Express middleware that validates req.body against the given Zod schema.
 * Responds with 400 and a list of field errors on failure.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Validation failed",
        errors,
      });
    }
    req.body = result.data;
    return next();
  };
}

/**
 * Returns an Express middleware that validates req.query against the given Zod schema.
 * Responds with 400 and a list of field errors on failure.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Validation failed",
        errors,
      });
    }
    // Replace req.query with the parsed + coerced values
    (req as any).query = result.data;
    return next();
  };
}

function formatZodErrors(error: ZodError) {
  return error.errors.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
}
