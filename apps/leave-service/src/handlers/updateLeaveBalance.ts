import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const updateLeaveBalance = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { username, balances, accumulatedPLBeforeCurrentMonth } =
      call.request;

    if (!username) {
      return callback(null, {
        message: MESSAGES.USERNAME_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const balance = await prisma.leaveBalance.upsert({
      where: { username },
      create: {
        username,
        balances: balances ?? {},
        accumulatedPLBeforeCurrentMonth: accumulatedPLBeforeCurrentMonth ?? 0,
      },
      update: {
        ...(balances !== undefined && { balances }),
        ...(accumulatedPLBeforeCurrentMonth !== undefined && {
          accumulatedPLBeforeCurrentMonth,
        }),
      },
    });

    return callback(null, {
      message: MESSAGES.LEAVE_BALANCE_UPDATED,
      status: status.OK,
      data: balance,
    });
  } catch (err) {
    logger.error("UpdateLeaveBalance error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
