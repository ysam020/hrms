import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const updateUser = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, firstName, lastName, phone, employeePhoto } = call.request;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(firstName && { first_name: firstName }),
        ...(lastName && { last_name: lastName }),
        ...(phone && { mobile: phone }),
        ...(employeePhoto && { employee_photo: employeePhoto }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        first_name: true,
        last_name: true,
        mobile: true,
        department: true,
        designation: true,
        employeeStatus: true,
        employee_photo: true,
        createdAt: true,
      },
    });

    const tenantId = getTenantId() ?? "global";
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:users:*`),
      cacheManager.delete(`t:${tenantId}:user:${userId}`),
    ]);
    return callback(null, {
      message: MESSAGES.USER_UPDATED,
      status: status.OK,
      data: { ...user },
    });
  } catch (err) {
    logger.error("UpdateUser error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: {},
    });
  }
};
