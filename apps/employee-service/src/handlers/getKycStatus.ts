import { readSensitiveForDisplay } from "@hrms/crypto";
import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

const open = (value: string | null, field: string) =>
  value ? readSensitiveForDisplay(value, field) : value;

export const getKycStatus = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        kyc_approval: true,
        kyc_date: true,
        aadhar_no: true,
        pan_no: true,
        bank_account_no: true,
        pf_no: true,
        uan_no: true,
        esic_no: true,
      },
    });

    if (!user) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    return callback(null, {
      message: MESSAGES.KYC_STATUS_FETCHED,
      status: status.OK,
      data: {
        ...user,
        aadhar_no: open(user.aadhar_no, "aadhar_no"),
        pan_no: open(user.pan_no, "pan_no"),
        bank_account_no: open(user.bank_account_no, "bank_account_no"),
        pf_no: open(user.pf_no, "pf_no"),
        uan_no: open(user.uan_no, "uan_no"),
        esic_no: open(user.esic_no, "esic_no"),
      },
    });
  } catch (err) {
    logger.error("GetKycStatus error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
