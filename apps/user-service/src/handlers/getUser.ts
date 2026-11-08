import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { readSensitiveForDisplay } from "@hrms/crypto";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

// dob/joining_date/dateOfTermination/dateOfAbscond/kyc_date are Prisma
// DateTime? columns — Prisma returns them as real Date objects, but the
// proto declares them as `string`. Passing the Date through as-is gets
// coerced via Date.prototype.toString() (e.g. "Sun Oct 10 1993 05:30:00
// GMT+0530 (India Standard Time)") instead of a proper date string, which
// then fails the gateway's max-length validation on write-back.
function toIsoOrEmpty(value: Date | string | null | undefined): string {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : value;
}

const SEALED_USER_FIELDS: ReadonlyArray<[string, string]> = [
  ["mobile", "mobile"],
  ["communicationAddressLine1", "communication_address_line_1"],
  ["communicationAddressLine2", "communication_address_line_2"],
  ["communicationAddressCity", "communication_address_city"],
  ["communicationAddressState", "communication_address_state"],
  ["communicationAddressPincode", "communication_address_pincode"],
  ["permanentAddressLine1", "permanent_address_line_1"],
  ["permanentAddressLine2", "permanent_address_line_2"],
  ["permanentAddressCity", "permanent_address_city"],
  ["permanentAddressState", "permanent_address_state"],
  ["permanentAddressPincode", "permanent_address_pincode"],
  ["bankAccountNo", "bank_account_no"],
  ["aadharNo", "aadhar_no"],
  ["aadharPhotoFront", "aadhar_photo_front"],
  ["aadharPhotoBack", "aadhar_photo_back"],
  ["panNo", "pan_no"],
  ["panPhoto", "pan_photo"],
  ["pfNo", "pf_no"],
  ["uanNo", "uan_no"],
  ["esicNo", "esic_no"],
];

function openUserResponse<T extends { data: Record<string, any> }>(
  response: T,
): T {
  const data = { ...response.data };
  for (const [key, field] of SEALED_USER_FIELDS) {
    if (key in data) data[key] = readSensitiveForDisplay(data[key], field);
  }
  return { ...response, data };
}

export const getUser = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  const emptyUser = {
    id: "",
    email: "",
    username: "",
    role: "",
    firstName: "",
    lastName: "",
    middleName: "",
    mobile: "",
    department: "",
    designation: "",
    employeeStatus: "",
    employeePhoto: "",
    dob: "",
    bloodGroup: "",
    officialEmail: "",
    joiningDate: "",
    communicationAddressLine1: "",
    communicationAddressLine2: "",
    communicationAddressCity: "",
    communicationAddressState: "",
    communicationAddressPincode: "",
    permanentAddressLine1: "",
    permanentAddressLine2: "",
    permanentAddressCity: "",
    permanentAddressState: "",
    permanentAddressPincode: "",
    bankAccountNo: "",
    bankName: "",
    ifscCode: "",
    aadharNo: "",
    aadharPhotoFront: "",
    panNo: "",
    panPhoto: "",
    pfNo: "",
    uanNo: "",
    esicNo: "",
    isSuperUser: false,
    dateOfTermination: "",
    reasonForTermination: "",
    dateOfAbscond: "",
    qualification: "",
    aadharPhotoBack: "",
    educationCertificates: [] as string[],
    experienceCertificate: "",
    electricityBill: "",
    kycApproval: "",
    kycDate: "",
    kycRevisionNotesJson: "",
    kycEditRequestReason: "",
    kycEditWindow: "",
  };

  try {
    const { userId } = call.request;

    const tenantId = getTenantId() ?? "global";
    // v2: the GetUser response shape grew new fields (qualification,
    // aadharPhotoBack, educationCertificates, experienceCertificate,
    // electricityBill, kycApproval, kycDate).
    // v3: date fields (dob, joiningDate, kycDate, dateOfTermination,
    // dateOfAbscond) now serialize as ISO strings instead of Date objects
    // coercing to Date.prototype.toString()'s verbose form.
    // v4: added kycRevisionNotesJson.
    // v5: added kycEditRequestReason.
    // v6: added kycEditWindow.
    // v7: sensitive fields are cached sealed and opened per response. The
    // bump also retires older entries that held them in the clear.
    // Bump this suffix whenever the response shape or field formatting
    // changes, so a stale cached entry is never replayed.
    const cacheKey = `t:${tenantId}:user:v7:${userId}`;
    const cached = await cacheManager.get<any>(cacheKey);
    if (cached) return callback(null, openUserResponse(cached));

    const isObjectId = /^[a-f\d]{24}$/i.test(userId);
    const user = await prismaWithTenant.user.findFirst({
      where: {
        OR: [{ username: userId }, ...(isObjectId ? [{ id: userId }] : [])],
      },
    });

    if (!user)
      return callback(null, {
        message: MESSAGES.USER_NOT_FOUND,
        status: status.NOT_FOUND,
        data: emptyUser,
      });

    const response = {
      message: MESSAGES.USER_FETCHED,
      status: status.OK,
      data: {
        id: user.id,
        email: user.email ?? "",
        username: user.username,
        role: (user.role ?? []).join(","),
        firstName: user.first_name ?? "",
        lastName: user.last_name ?? "",
        middleName: user.middle_name ?? "",
        mobile: user.mobile ?? "",
        department: user.department ?? "",
        designation: user.designation ?? "",
        employeeStatus: user.employeeStatus ?? "",
        employeePhoto: user.employee_photo ?? "",
        dob: toIsoOrEmpty(user.dob),
        bloodGroup: user.blood_group ?? "",
        officialEmail: user.official_email ?? "",
        joiningDate: toIsoOrEmpty(user.joining_date),
        communicationAddressLine1: user.communication_address_line_1 ?? "",
        communicationAddressLine2: user.communication_address_line_2 ?? "",
        communicationAddressCity: user.communication_address_city ?? "",
        communicationAddressState: user.communication_address_state ?? "",
        communicationAddressPincode: user.communication_address_pincode ?? "",
        permanentAddressLine1: user.permanent_address_line_1 ?? "",
        permanentAddressLine2: user.permanent_address_line_2 ?? "",
        permanentAddressCity: user.permanent_address_city ?? "",
        permanentAddressState: user.permanent_address_state ?? "",
        permanentAddressPincode: user.permanent_address_pincode ?? "",
        bankAccountNo: user.bank_account_no ?? "",
        bankName: user.bank_name ?? "",
        ifscCode: user.ifsc_code ?? "",
        aadharNo: user.aadhar_no ?? "",
        aadharPhotoFront: user.aadhar_photo_front ?? "",
        panNo: user.pan_no ?? "",
        panPhoto: user.pan_photo ?? "",
        pfNo: user.pf_no ?? "",
        uanNo: user.uan_no ?? "",
        esicNo: user.esic_no ?? "",
        isSuperUser: user.isSuperUser ?? false,
        dateOfTermination: toIsoOrEmpty(user.dateOfTermination),
        reasonForTermination: user.reasonForTermination ?? "",
        dateOfAbscond: toIsoOrEmpty(user.dateOfAbscond),
        qualification: user.qualification ?? "",
        aadharPhotoBack: user.aadhar_photo_back ?? "",
        educationCertificates: user.education_certificates ?? [],
        experienceCertificate: user.experience_certificate ?? "",
        electricityBill: user.electricity_bill ?? "",
        kycApproval: user.kyc_approval ?? "",
        kycDate: toIsoOrEmpty(user.kyc_date),
        kycRevisionNotesJson: user.kyc_revision_notes
          ? JSON.stringify(user.kyc_revision_notes)
          : "",
        kycEditRequestReason: user.kyc_edit_request_reason ?? "",
        kycEditWindow: user.kyc_edit_window ?? "",
      },
    };
    await cacheManager.set(cacheKey, response, "user");
    return callback(null, openUserResponse(response));
  } catch (err) {
    logger.error("GetUser error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: emptyUser,
    });
  }
};
