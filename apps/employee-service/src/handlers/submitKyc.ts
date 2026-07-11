import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  prismaWithTenant as prisma,
  getTenantId,
  canonicalizeEmail,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import { getKycApprovers } from "../utils/kycApprovers";

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
        // Normalized the same way as Google OAuth login — otherwise a
        // retyped Gmail address (e.g. a different dot placement) can drift
        // from what login matches against, stranding the account.
        ...(email && { email: canonicalizeEmail(email) }),
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
        // Reset to Pending when the employee is (re)submitting their own KYC
        // (signalled by userId, same as a fresh completeKyc call) or when
        // there's no prior decision to preserve. An HR-side correction via
        // editKyc (keyed by username only, on a record that's already been
        // Approved/Rejected) must not silently discard that decision.
        ...((userId || !user.kyc_approval) && { kyc_approval: "Pending" }),
        // A self-submit consumes an open edit window (granted by
        // allowKycEdit) — re-locking the record until HR reviews it again.
        // Any other self-submit (fresh onboarding, or resubmitting after a
        // Revision Requested) recomputes this to null so a long-past reopen
        // can never leave a stale lock behind.
        ...(userId && {
          kyc_edit_window: user.kyc_edit_window === "open" ? "closed" : null,
        }),
      },
    });

    const tenantId = getTenantId() ?? "global";
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:employees:*`),
      cacheManager.delete(`t:${tenantId}:employee:${user.id}`),
      cacheManager.delete(`t:${tenantId}:employee-details:${user.username}`),
      // /get-user-data/:username (used by the KYC form's edit-prefill and the
      // HR detail/approval page) reads through user-service's GetUser RPC,
      // which caches under this key — keyed by whatever the gateway passed
      // as userId, which for that route is always the username. Without
      // this, a submit/edit here would leave that page showing stale data
      // until the cache's own TTL expires.
      cacheManager.delete(`t:${tenantId}:user:v6:${user.id}`),
      cacheManager.delete(`t:${tenantId}:user:v6:${user.username}`),
    ]);

    // Notify everyone who can approve this KYC (fire-and-forget) — only
    // when this call actually left the record in "Pending" (a fresh
    // submission or resubmission awaiting review). An HR-side correction
    // via editKyc on an already-decided record (keyed by username only, no
    // reset — see the kyc_approval reset comment above) must not spam
    // approvers who have nothing new to review.
    if (updatedUser.kyc_approval === "Pending") {
      getKycApprovers(tenantId, "approve_kyc")
        .then((approvers) => {
          if (approvers.length === 0) return;
          return getNotificationQueue().add("kycSubmitted", {
            title: "KYC",
            message: `${user.username} filled out their KYC form`,
            recipients: approvers.map((u) => u.id),
            pushTargets: approvers.map((u) => u.username),
            eventType: "kyc_notification",
            priority: "medium",
            sendPushNotification: true,
            // Live-refresh signal for the Pending Approvals widget/badge/
            // inbox — mirrors kyc-edit-requested in requestKycEditAccess.ts.
            socketEvent: "kyc-submitted",
            socketPayload: {
              userId: user.id,
              username: user.username,
              submittedAt: updatedUser.kyc_date,
            },
          });
        })
        .catch((err) =>
          logger.error("[submitKyc] Notification enqueue failed:", { err }),
        );
    }

    return callback(null, {
      message: MESSAGES.KYC_SUBMITTED,
      status: status.OK,
      kycStatus: updatedUser.kyc_approval,
    });
  } catch (err) {
    logger.error("SubmitKyc error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
