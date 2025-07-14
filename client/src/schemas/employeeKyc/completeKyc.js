import * as yup from "yup";

const emailRegex =
  /[a-zA-Z0-9_]+(\.)?[a-zA-Z0-9_]+[@]{1}[a-zA-Z]+\.[a-zA-Z]{2,6}/;
const mobileNumberRegex = /^[6-9]\d{9}$/;
const aadharNumberRegex = /^\d{12}$/;
const panNumberRegex = /^[A-Z]{5}\d{4}[A-Z]$/;
const pinCodeRegex = /^\d{6}$/;

export const validationSchema = yup.object({
  employee_photo: yup
    .string("Upload Employee photo")
    .required("Employee photo is required"),
  designation: yup
    .string("Enter designation")
    .required("Designation is required"),
  department: yup.string("Enter department").required("Department is required"),
  joining_date: yup
    .string("Enter joining date")
    .required("Joining date is required"),
  dob: yup.string("Enter date of birth").required("Date of birth is required"),
  permanent_address_line_1: yup
    .string("Enter address line 1")
    .required("Address line 1 is required"),
  permanent_address_line_2: yup
    .string("Enter address line 2")
    .required("Address line 2 is required"),
  permanent_address_city: yup.string("Enter city").required("City is required"),
  permanent_address_state: yup
    .string("Enter state")
    .required("State is required"),
  permanent_address_pincode: yup
    .string("Enter pincode")
    .required("Pincode is required")
    .matches(pinCodeRegex, "Invalid pincode"),
  communication_address_line_1: yup
    .string("Enter address line 1")
    .required("Address line 1 is required"),
  communication_address_line_2: yup
    .string("Enter address line 2")
    .required("Address line 2 is required"),
  communication_address_city: yup
    .string("Enter city")
    .required("City is required"),
  communication_address_state: yup
    .string("Enter state")
    .required("State is required"),
  communication_address_pincode: yup
    .string("Enter pincode")
    .required("Pincode is required")
    .matches(pinCodeRegex, "Invalid pincode"),
  email: yup
    .string()
    .required("Email is required")
    .email("Invalid email")
    .matches(emailRegex, "Invalid email"),
  official_email: yup
    .string()
    .email("Invalid email")
    .matches(emailRegex, "Invalid official email"),
  mobile: yup
    .string("Enter mobile number")
    .required("Mobile number is required")
    .matches(mobileNumberRegex, "Invalid mobile"),
  qualification: yup
    .string("Enter highest qualification")
    .required("Highest qualification is required"),
  aadhar_no: yup
    .string("Enter AADHAR no")
    .required("AADHAR no is required")
    .matches(aadharNumberRegex, "Invalid AADHAR no"),
  aadhar_photo_front: yup
    .string("Enter AADHAR photo front")
    .required("AADHAR photo front is required"),
  aadhar_photo_back: yup
    .string("Enter AADHAR photo back")
    .required("AADHAR photo back is required"),
  pan_no: yup
    .string("Enter PAN no")
    .required("PAN no is required")
    .matches(panNumberRegex, "Invalid PAN no"),
  pan_photo: yup.string("Upload PAN photo").required("PAN photo is required"),
  bank_account_no: yup
    .string("Enter bank account no")
    .required("Bank account no is required"),
  bank_name: yup.string("Enter bank name").required("Bank name is required"),
  ifsc_code: yup.string("Enter IFSC code").required("IFSC code is required"),
});
