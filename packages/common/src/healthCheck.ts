import { status } from "@grpc/grpc-js";

export const healthCheck = async (call: any, callback: any) => {
  return callback(null, {
    status: status.OK,
    message: "Service is healthy",
  });
};
