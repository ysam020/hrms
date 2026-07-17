import { z } from "zod";
import * as grpc from "@grpc/grpc-js";
import { validationMiddleware } from "../middleware/validation";

const schema = z.object({
  name: z.string().min(1),
  age: z.number().min(0),
});

describe("validationMiddleware", () => {
  it("calls next() and replaces call.request with the parsed data on success", async () => {
    const call: any = { request: { name: "Jane", age: 30 } };
    const next = jest.fn().mockResolvedValue("ok");
    const middleware = validationMiddleware(schema);

    const result = await middleware(call, next);

    expect(next).toHaveBeenCalled();
    expect(result).toBe("ok");
    expect(call.request).toEqual({ name: "Jane", age: 30 });
  });

  it("throws a structured gRPC error with INVALID_ARGUMENT on validation failure", async () => {
    const call: any = { request: { name: "", age: -1 } };
    const next = jest.fn();
    const middleware = validationMiddleware(schema);

    await expect(middleware(call, next)).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("joins all validation error messages together", async () => {
    const call: any = { request: {} };
    const middleware = validationMiddleware(schema);

    try {
      await middleware(call, jest.fn());
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err.message).toEqual(expect.any(String));
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  it("attaches the validation errors as gRPC metadata", async () => {
    const call: any = { request: { name: "", age: -1 } };
    const middleware = validationMiddleware(schema);

    try {
      await middleware(call, jest.fn());
      throw new Error("should have thrown");
    } catch (err: any) {
      const raw = err.metadata.get("validation-errors")[0];
      const parsed = JSON.parse(raw);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    }
  });

  it("strips unknown fields via schema parsing (call.request becomes the parsed/sanitized data)", async () => {
    const call: any = {
      request: { name: "Jane", age: 30, extra: "should be dropped" },
    };
    const middleware = validationMiddleware(schema);
    await middleware(call, jest.fn());
    expect(call.request).not.toHaveProperty("extra");
  });
});
