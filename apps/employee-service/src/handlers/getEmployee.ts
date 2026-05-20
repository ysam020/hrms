import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const getEmployee = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:employee:${id}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const response = {
      message: MESSAGES.EMPLOYEE_FETCHED,
      status: status.OK,
      data: user,
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
