import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const getLeaveBalance = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.USERNAME_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const balance = await prisma.leaveBalance.findUnique({
      where: { userId },
    });

    const data = balance
      ? {
          id: balance.id,
          userId: balance.userId,
          accumulatedPlBeforeCurrentMonth:
            balance.accumulatedPLBeforeCurrentMonth ?? 0,
          balances: balance.balances ? JSON.stringify(balance.balances) : "",
        }
      : null;

    return callback(null, {
      message: balance ? MESSAGES.LEAVE_FETCHED : MESSAGES.NO_LEAVE_BALANCE,
      status: status.OK,
      data,
      userId,
    });
  } catch (err) {
    logger.error("GetLeaveBalance error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
