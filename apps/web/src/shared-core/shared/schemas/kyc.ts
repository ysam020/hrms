import { z } from "zod";

// Regex patterns (sourced from @hrms/validation-utils)
const emailRegex =
  /[a-zA-Z0-9_]+(\.)?[a-zA-Z0-9_]+[@]{1}[a-zA-Z]+\.[a-zA-Z]{2,6}/;
const mobileRegex = /^[6-9]\d{9}$/;
const aadharRegex = /^\d{12}$/;
const panRegex = /^[A-Z]{5}\d{4}[A-Z]$/;
const pinCodeRegex = /^\d{6}$/;

export const kycSchema = z.object({
  employee_photo: z.string().min(1, "Employee photo is required"),
  dob: z.string().min(1, "Date of birth is required"),
  permanent_address_line_1: z.string().min(1, "Address line 1 is required"),
  permanent_address_line_2: z.string().min(1, "Address line 2 is required"),
  permanent_address_city: z.string().min(1, "City is required"),
  permanent_address_state: z.string().min(1, "State is required"),
  permanent_address_pincode: z
    .string()
    .min(1, "Pincode is required")
    .regex(pinCodeRegex, "Invalid pincode"),
  communication_address_line_1: z.string().min(1, "Address line 1 is required"),
  communication_address_line_2: z.string().min(1, "Address line 2 is required"),
  communication_address_city: z.string().min(1, "City is required"),
  communication_address_state: z.string().min(1, "State is required"),
  communication_address_pincode: z
    .string()
    .min(1, "Pincode is required")
    .regex(pinCodeRegex, "Invalid pincode"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email")
    .regex(emailRegex, "Invalid email"),
  official_email: z
    .string()
    .email("Invalid email")
    .regex(emailRegex, "Invalid official email")
    .optional()
    .or(z.literal("")),
  mobile: z
    .string()
    .min(1, "Mobile number is required")
    .regex(mobileRegex, "Invalid mobile"),
  qualification: z.string().min(1, "Highest qualification is required"),
  aadhar_no: z
    .string()
    .min(1, "AADHAR no is required")
    .regex(aadharRegex, "Invalid AADHAR no"),
  aadhar_photo_front: z.string().min(1, "AADHAR photo front is required"),
  aadhar_photo_back: z.string().min(1, "AADHAR photo back is required"),
  pan_no: z
    .string()
    .min(1, "PAN no is required")
    .regex(panRegex, "Invalid PAN no"),
  pan_photo: z.string().min(1, "PAN photo is required"),
  bank_account_no: z.string().min(1, "Bank account no is required"),
  bank_name: z.string().min(1, "Bank name is required"),
  ifsc_code: z.string().min(1, "IFSC code is required"),
});

export type KycFormValues = z.infer<typeof kycSchema>;
