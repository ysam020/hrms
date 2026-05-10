import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const submitKyc = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
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

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        aadhar_no: aadharNo || null,
        aadhar_photo_front: aadharPhotoFront || null,
        aadhar_photo_back: aadharPhotoBack || null,
        pan_no: panNo || null,
        pan_photo: panPhoto || null,
        bank_account_no: bankAccountNo || null,
        bank_name: bankName || null,
        ifsc_code: ifscCode || null,
        pf_no: pfNo || null,
        uan_no: uanNo || null,
        esic_no: esicNo || null,
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
        logger.error("[submitKyc] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.KYC_SUBMITTED,
      status: status.OK,
      data: updatedUser,
    });
  } catch (err) {
    logger.error("SubmitKyc error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
