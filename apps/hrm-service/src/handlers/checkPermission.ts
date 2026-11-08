import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const checkPermission = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, resource, action } = call.request;

    if (!userId || !resource || !action) {
      return callback(null, {
        message: MESSAGES.USER_ID_RESOURCE_ACTION_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        permissions: true,
        isSuperUser: true,
      },
    });

    // isSuperUser/permissions on the master record belong to the
    // user's home organisation. prismaWithTenant injects the bound tenant
    // into the lookup, so a record is only found inside that organisation —
    // but with NO tenant bound it applies no filter, and a record from any
    // organisation would match. Refuse in that case.
    if (!user || !getTenantId()) {
      return callback(null, {
        message: MESSAGES.USER_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    // Super users have all permissions
    if (user.isSuperUser) {
      return callback(null, {
        message: MESSAGES.PERMISSION_CHECK_PASSED,
        status: status.OK,
        allowed: true,
        reason: "super_user",
      });
    }

    // Check direct permission: format "resource:action"
    const permissionKey = `${resource}:${action}`;
    const userPermissions = (user.permissions as string[]) || [];

    if (
      userPermissions.includes(permissionKey) ||
      userPermissions.includes(`${resource}:*`)
    ) {
      return callback(null, {
        message: MESSAGES.PERMISSION_GRANTED,
        status: status.OK,
        allowed: true,
        reason: "direct_permission",
      });
    }

    return callback(null, {
      message: MESSAGES.PERMISSION_DENIED,
      status: status.OK,
      allowed: false,
      reason: "no_permission",
    });
  } catch (err) {
    logger.error("CheckPermission error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
