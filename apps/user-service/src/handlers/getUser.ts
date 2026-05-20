import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { safeDecrypt } from "@hrms/crypto";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

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
  };

  try {
    const { userId } = call.request;

    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:user:${userId}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

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
        mobile: safeDecrypt(user.mobile),
        department: user.department ?? "",
        designation: user.designation ?? "",
        employeeStatus: user.employeeStatus ?? "",
        employeePhoto: user.employee_photo ?? "",
        dob: user.dob ?? "",
        bloodGroup: user.blood_group ?? "",
        officialEmail: user.official_email ?? "",
        joiningDate: user.joining_date ?? "",
        communicationAddressLine1: safeDecrypt(
          user.communication_address_line_1,
        ),
        communicationAddressLine2: safeDecrypt(
          user.communication_address_line_2,
        ),
        communicationAddressCity: safeDecrypt(user.communication_address_city),
        communicationAddressState: safeDecrypt(
          user.communication_address_state,
        ),
        communicationAddressPincode: safeDecrypt(
          user.communication_address_pincode,
        ),
        permanentAddressLine1: safeDecrypt(user.permanent_address_line_1),
        permanentAddressLine2: safeDecrypt(user.permanent_address_line_2),
        permanentAddressCity: safeDecrypt(user.permanent_address_city),
        permanentAddressState: safeDecrypt(user.permanent_address_state),
        permanentAddressPincode: safeDecrypt(user.permanent_address_pincode),
        bankAccountNo: safeDecrypt(user.bank_account_no),
        bankName: user.bank_name ?? "",
        ifscCode: user.ifsc_code ?? "",
        aadharNo: safeDecrypt(user.aadhar_no),
        aadharPhotoFront: safeDecrypt(user.aadhar_photo_front),
        panNo: safeDecrypt(user.pan_no),
        panPhoto: safeDecrypt(user.pan_photo),
        pfNo: safeDecrypt(user.pf_no),
        uanNo: safeDecrypt(user.uan_no),
        esicNo: safeDecrypt(user.esic_no),
        isSuperUser: user.isSuperUser ?? false,
        dateOfTermination: user.dateOfTermination ?? "",
        reasonForTermination: user.reasonForTermination ?? "",
        dateOfAbscond: user.dateOfAbscond ?? "",
      },
    };
    await cacheManager.set(cacheKey, response, "user");
    return callback(null, response);
  } catch (err) {
    logger.error("GetUser error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: emptyUser,
    });
  }
};
