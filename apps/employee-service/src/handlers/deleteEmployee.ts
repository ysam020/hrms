import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const deleteEmployee = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, hardDelete } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const invalidate = () =>
      Promise.all([
        cacheManager.invalidatePattern("employees:*"),
        cacheManager.delete(`employee:${id}`),
      ]);

    if (hardDelete) {
      await prisma.user.delete({ where: { id } });
      await invalidate();
      return callback(null, {
        message: MESSAGES.EMPLOYEE_PERMANENTLY_DELETED,
        status: status.OK,
      });
    }

    await prisma.user.update({
      where: { id },
      data: { employeeStatus: "Terminated" },
    });

    await invalidate();
    return callback(null, {
      message: MESSAGES.EMPLOYEE_DEACTIVATED,
      status: status.OK,
    });
  } catch (err) {
    logger.error("DeleteEmployee error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
