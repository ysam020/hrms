import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const updateEmployee = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, ...updateData } = call.request;

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

    // Remove undefined/null values and non-updatable fields
    const cleanedData: Record<string, any> = {};
    const fieldMap: Record<string, string> = {
      firstName: "first_name",
      lastName: "last_name",
      department: "department",
      designation: "designation",
      phone: "phone",
      address: "address",
      employeeStatus: "employeeStatus",
      wfh: "wfh",
      pfNo: "pf_no",
      uanNo: "uan_no",
      esicNo: "esic_no",
      joiningDate: "joining_date",
    };

    for (const [protoField, dbField] of Object.entries(fieldMap)) {
      if (
        updateData[protoField] !== undefined &&
        updateData[protoField] !== null
      ) {
        cleanedData[dbField] = updateData[protoField];
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: cleanedData,
    });

    const tenantId = getTenantId() ?? "global";
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:employees:*`),
      cacheManager.delete(`t:${tenantId}:employee:${id}`),
      cacheManager.delete(
        `t:${tenantId}:employee-details:${existingUser.username}`,
      ),
    ]);
    return callback(null, {
      message: MESSAGES.EMPLOYEE_UPDATED,
      status: status.OK,
      data: updatedUser,
    });
  } catch (err) {
    logger.error("UpdateEmployee error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
