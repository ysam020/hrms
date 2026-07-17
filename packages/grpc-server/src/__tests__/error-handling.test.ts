import * as grpc from "@grpc/grpc-js";
import { GrpcError, errorHandler } from "../error-handling";

describe("GrpcError", () => {
  it("defaults to INTERNAL when no code is given", () => {
    const err = new GrpcError("boom");
    expect(err.message).toBe("boom");
    expect(err.code).toBe(grpc.status.INTERNAL);
    expect(err.name).toBe("GrpcError");
    expect(err).toBeInstanceOf(Error);
  });

  it("carries an explicit status code", () => {
    const err = new GrpcError("nope", grpc.status.NOT_FOUND);
    expect(err.code).toBe(grpc.status.NOT_FOUND);
  });
});

describe("errorHandler", () => {
  it("passes through a GrpcError's code and message", () => {
    const err = new GrpcError("forbidden", grpc.status.PERMISSION_DENIED);
    const result = errorHandler(err);
    expect(result.code).toBe(grpc.status.PERMISSION_DENIED);
    expect(result.message).toBe("forbidden");
    expect(result.metadata).toBeInstanceOf(grpc.Metadata);
  });

  it("passes through a plain object carrying a valid grpc status code", () => {
    const result = errorHandler({
      code: grpc.status.ALREADY_EXISTS,
      message: "dup",
    });
    expect(result.code).toBe(grpc.status.ALREADY_EXISTS);
    expect(result.message).toBe("dup");
  });

  it("falls back to a default message when a valid-status error has no message", () => {
    const result = errorHandler({ code: grpc.status.NOT_FOUND });
    expect(result.code).toBe(grpc.status.NOT_FOUND);
    expect(result.message).toBe("Error");
  });

  it("defaults to INTERNAL for an arbitrary Error", () => {
    const result = errorHandler(new Error("db exploded"));
    expect(result.code).toBe(grpc.status.INTERNAL);
    expect(result.message).toBe("db exploded");
  });

  it("defaults to INTERNAL with a generic message for a non-Error value with no message", () => {
    const result = errorHandler(undefined);
    expect(result.code).toBe(grpc.status.INTERNAL);
    expect(result.message).toBe("Internal server error");
  });

  it("treats an object with an out-of-range numeric code as not a valid grpc status", () => {
    const result = errorHandler({ code: 9999, message: "weird" });
    expect(result.code).toBe(grpc.status.INTERNAL);
    expect(result.message).toBe("weird");
  });
});
