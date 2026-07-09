import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
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
      username,
      employeePhoto,
      dob,
      bloodGroup,
      qualification,
      mobile,
      email,
      officialEmail,
      permanentAddressLine1,
      permanentAddressLine2,
      permanentAddressCity,
      permanentAddressState,
      permanentAddressPincode,
      communicationAddressLine1,
      communicationAddressLine2,
      communicationAddressCity,
      communicationAddressState,
      communicationAddressPincode,
      aadharNo,
      aadharPhotoFront,
      aadharPhotoBack,
      panNo,
      panPhoto,
      educationCertificates,
      experienceCertificate,
      electricityBill,
      bankAccountNo,
      bankName,
      ifscCode,
    } = call.request;

    if (!userId && !username) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const where = userId ? { id: userId } : { username };
    const user = await prisma.user.findUnique({ where });
    if (!user) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(employeePhoto && { employee_photo: employeePhoto }),
        ...(dob && { dob: new Date(dob) }),
        ...(bloodGroup && { blood_group: bloodGroup }),
        ...(qualification && { qualification }),
        ...(mobile && { mobile }),
        ...(email && { email }),
        ...(officialEmail && { official_email: officialEmail }),
        ...(permanentAddressLine1 && {
          permanent_address_line_1: permanentAddressLine1,
        }),
        ...(permanentAddressLine2 && {
          permanent_address_line_2: permanentAddressLine2,
        }),
        ...(permanentAddressCity && {
          permanent_address_city: permanentAddressCity,
        }),
        ...(permanentAddressState && {
          permanent_address_state: permanentAddressState,
        }),
        ...(permanentAddressPincode && {
          permanent_address_pincode: permanentAddressPincode,
        }),
        ...(communicationAddressLine1 && {
          communication_address_line_1: communicationAddressLine1,
        }),
        ...(communicationAddressLine2 && {
          communication_address_line_2: communicationAddressLine2,
        }),
        ...(communicationAddressCity && {
          communication_address_city: communicationAddressCity,
        }),
        ...(communicationAddressState && {
          communication_address_state: communicationAddressState,
        }),
        ...(communicationAddressPincode && {
          communication_address_pincode: communicationAddressPincode,
        }),
        ...(aadharNo && { aadhar_no: aadharNo }),
        ...(aadharPhotoFront && { aadhar_photo_front: aadharPhotoFront }),
        ...(aadharPhotoBack && { aadhar_photo_back: aadharPhotoBack }),
        ...(panNo && { pan_no: panNo }),
        ...(panPhoto && { pan_photo: panPhoto }),
        ...(educationCertificates?.length && {
          education_certificates: educationCertificates,
        }),
        ...(experienceCertificate && {
          experience_certificate: experienceCertificate,
        }),
        ...(electricityBill && { electricity_bill: electricityBill }),
        ...(bankAccountNo && { bank_account_no: bankAccountNo }),
        ...(bankName && { bank_name: bankName }),
        ...(ifscCode && { ifsc_code: ifscCode }),
        kyc_date: new Date(),
        kyc_approval: "Pending",
      },
    });

    const tenantId = getTenantId() ?? "global";
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:employees:*`),
      cacheManager.delete(`t:${tenantId}:employee:${user.id}`),
      cacheManager.delete(`t:${tenantId}:employee-details:${user.username}`),
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
