import { ZodSchema } from "zod";
import * as grpc from "@grpc/grpc-js";

export const validationMiddleware = (schema: ZodSchema) => {
  return async (call: any, next: () => Promise<any>) => {
    const result = schema.safeParse(call.request);
    if (!result.success) {
      const metadata = new grpc.Metadata();
      metadata.set("validation-errors", JSON.stringify(result.error.errors));
      throw {
        code: grpc.status.INVALID_ARGUMENT,
        message: result.error.errors.map((e) => e.message).join(", "),
        metadata,
      };
    }
    call.request = result.data;
    return next();
  };
};
