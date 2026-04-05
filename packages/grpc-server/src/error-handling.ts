import * as grpc from "@grpc/grpc-js";

export class GrpcError extends Error {
  code: grpc.status;
  constructor(message: string, code: grpc.status = grpc.status.INTERNAL) {
    super(message);
    this.code = code;
    this.name = "GrpcError";
  }
}

export const errorHandler = (
  error: any,
): { code: grpc.status; message: string; metadata: grpc.Metadata } => {
  const metadata = new grpc.Metadata();

  if (error instanceof GrpcError) {
    return { code: error.code, message: error.message, metadata };
  }

  if (error?.code && Object.values(grpc.status).includes(error.code)) {
    return { code: error.code, message: error.message || "Error", metadata };
  }

  return {
    code: grpc.status.INTERNAL,
    message: error?.message || "Internal server error",
    metadata,
  };
};
