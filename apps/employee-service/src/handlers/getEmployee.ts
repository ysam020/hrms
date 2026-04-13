import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { safeDecrypt } from "@hrms/common";
import { employee } from "@hrms/proto";
import { MESSAGES } from "../constants/messages";

/** Decrypt all PII fields on a user record before returning over gRPC. */
function decryptSensitiveFields(
  user: Record<string, any>,
): Record<string, any> {
  const piiFields = [
    "aadhar_no",
    "aadhar_photo_front",
    "aadhar_photo_back",
    "pan_no",
    "pan_photo",
    "bank_account_no",
    "pf_no",
    "uan_no",
    "esic_no",
    "mobile",
    "permanent_address_line_1",
    "permanent_address_line_2",
    "permanent_address_city",
    "permanent_address_state",
    "permanent_address_pincode",
    "communication_address_line_1",
    "communication_address_line_2",
    "communication_address_city",
    "communication_address_state",
    "communication_address_pincode",
  ];
  const result = { ...user };
  for (const field of piiFields) {
    if (result[field]) result[field] = safeDecrypt(result[field]);
  }
  return result;
}

export const getEmployee = async (
  call: ServerUnaryCall<
    employee.GetEmployeeRequest,
    employee.GetEmployeeResponse
  >,
  callback: sendUnaryData<employee.GetEmployeeResponse>,
) => {
  try {
    const { id } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const cacheKey = `employee:${id}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const decrypted = decryptSensitiveFields(user as Record<string, any>);
    const response = {
      message: MESSAGES.EMPLOYEE_FETCHED,
      status: status.OK,
      data: decrypted,
    };
    await cacheManager.set(cacheKey, response, "employee");
    return callback(null, response);
  } catch (err) {
    logger.error("GetEmployee error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
