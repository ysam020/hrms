import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

export const validate = (
  schema: ZodSchema,
  target: "body" | "params" | "query" = "body",
) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: result.error.errors[0]?.message ?? "Validation error",
      });
    }
    (req as any)[target] = result.data;
    next();
  };
