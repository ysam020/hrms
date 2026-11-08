import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";

/**
 * Retired. This RPC deducted every non-present calendar day, including
 * weekends and approved leave, and nothing called it. Payroll runs through
 * the gateway's initiatePayrollRun.
 */
export const processPayroll = async (
  _call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) =>
  callback(null, {
    message: "processPayroll has been retired",
    status: status.UNIMPLEMENTED,
  });
