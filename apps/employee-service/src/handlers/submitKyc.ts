import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { aesEncrypt } from "@hrms/common";
import { employee } from "@hrms/proto";
import { MESSAGES } from "../constants/messages";

/** Encrypt a value if non-empty, otherwise return null. */
const enc = (v: string | undefined | null): string | null =>
  v ? aesEncrypt(v) : null;

export const submitKyc = async (
  call: ServerUnaryCall<employee.KycRequest, employee.KycResponse>,
  callback: sendUnaryData<employee.KycResponse>,
) => {
  try {
    const {
      userId,
      aadharNo,
      aadharPhotoFront,
      aadharPhotoBack,
      panNo,
      panPhoto,
      bankAccountNo,
      bankName,
      ifscCode,
      pfNo,
      uanNo,
      esicNo,
    } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    // Encrypt all PII before persisting.
    // Non-sensitive lookup fields (kyc_date, kyc_approval) are stored in plaintext.
    await prisma.user.update({
      where: { id: userId },
      data: {
        aadhar_no: enc(aadharNo),
        aadhar_photo_front: enc(aadharPhotoFront),
        aadhar_photo_back: enc(aadharPhotoBack),
        pan_no: enc(panNo),
        pan_photo: enc(panPhoto),
        bank_account_no: enc(bankAccountNo),
        bank_name: bankName || null,
        ifsc_code: ifscCode || null,
        pf_no: enc(pfNo),
        uan_no: enc(uanNo),
        esic_no: enc(esicNo),
        kyc_date: new Date().toISOString(),
        kyc_approval: "Pending",
      },
    });

    await Promise.all([
      cacheManager.invalidatePattern("employees:*"),
      cacheManager.delete(`employee:${userId}`),
    ]);

    // Notify HR (fire-and-forget)
    prisma.user
      .findMany({
        where: { department: "HUMAN RESOURCES" },
        select: { id: true, username: true },
      })
      .then((hrUsers) => {
        if (hrUsers.length === 0) return;
        return getNotificationQueue().add("kycSubmitted", {
          title: "KYC",
          message: `${user.username} filled out their KYC form`,
          recipients: hrUsers.map((u) => u.id),
          pushTargets: hrUsers.map((u) => u.username),
          eventType: "kyc_notification",
          priority: "medium",
        });
      })
      .catch((err) =>
        logger.warn("[submitKyc] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.KYC_SUBMITTED,
      status: status.OK,
    });
  } catch (err) {
    logger.error("SubmitKyc error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
