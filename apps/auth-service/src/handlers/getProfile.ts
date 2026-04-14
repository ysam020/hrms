import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const getProfile = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
        employee_photo: true,
      },
    });

    if (!user) {
      return callback(null, {
        message: MESSAGES.USER_NOT_FOUND,
        status: status.NOT_FOUND,
        data: null,
      });
    }

    return callback(null, {
      message: MESSAGES.PROFILE_FETCHED,
      status: status.OK,
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        mobile: user.mobile || "",
        department: user.department || "",
        designation: user.designation || "",
        employeePhoto: user.employee_photo || "",
      },
    });
  } catch (err) {
    logger.error("GetProfile error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: null,
    });
  }
};
