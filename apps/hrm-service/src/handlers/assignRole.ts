import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const assignRole = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, role, assignedBy } = call.request;

    if (!userId || !role) {
      return callback(null, {
        message: MESSAGES.USER_ID_ROLE_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      return callback(null, {
        message: MESSAGES.USER_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    logger.info(
      `Role '${role}' assigned to user ${userId} by ${assignedBy || "system"}`,
    );

    return callback(null, {
      message: MESSAGES.ROLE_ASSIGNED,
      status: status.OK,
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    });
  } catch (err) {
    logger.error("AssignRole error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
