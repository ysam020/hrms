// KYC field vocabulary — the same field set as Classic's CompleteKYC form and
// ViewIndividualKyc's REVISABLE_FIELDS, grouped for the form and review.

export type KycFieldKind =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "state"
  | "blood"
  | "file"
  | "files";

export interface KycField {
  key: string;
  label: string;
  kind?: KycFieldKind;
  optional?: boolean;
  hint?: string;
  /** Sensitive identifiers are masked on the review page. */
  mask?: boolean;
}

export const KYC_GROUPS: { title: string; fields: KycField[] }[] = [
  {
    title: "Personal",
    fields: [
      { key: "employee_photo", label: "Photo", kind: "file" },
      { key: "dob", label: "Date of Birth", kind: "date" },
      { key: "mobile", label: "Mobile", kind: "tel", hint: "10 digits" },
      { key: "email", label: "Personal Email", kind: "email" },
      {
        key: "official_email",
        label: "Work Email",
        kind: "email",
        optional: true,
      },
      {
        key: "blood_group",
        label: "Blood Group",
        kind: "blood",
        optional: true,
      },
      { key: "qualification", label: "Highest Qualification" },
    ],
  },
  {
    title: "Permanent Address",
    fields: [
      { key: "permanent_address_line_1", label: "Address Line 1" },
      { key: "permanent_address_line_2", label: "Address Line 2" },
      { key: "permanent_address_city", label: "City" },
      { key: "permanent_address_state", label: "State", kind: "state" },
      { key: "permanent_address_pincode", label: "PIN Code", hint: "6 digits" },
    ],
  },
  {
    title: "Communication Address",
    fields: [
      { key: "communication_address_line_1", label: "Address Line 1" },
      { key: "communication_address_line_2", label: "Address Line 2" },
      { key: "communication_address_city", label: "City" },
      { key: "communication_address_state", label: "State", kind: "state" },
      {
        key: "communication_address_pincode",
        label: "PIN Code",
        hint: "6 digits",
      },
    ],
  },
  {
    title: "Identity Documents",
    fields: [
      {
        key: "aadhar_no",
        label: "Aadhaar Number",
        hint: "12 digits",
        mask: true,
      },
      { key: "aadhar_photo_front", label: "Aadhaar — Front", kind: "file" },
      { key: "aadhar_photo_back", label: "Aadhaar — Back", kind: "file" },
      { key: "pan_no", label: "PAN", hint: "e.g. ABCDE1234F", mask: true },
      { key: "pan_photo", label: "PAN Card", kind: "file" },
    ],
  },
  {
    title: "Education & Experience",
    fields: [
      {
        key: "education_certificates",
        label: "Education Certificates",
        kind: "files",
        optional: true,
      },
      {
        key: "experience_certificate",
        label: "Experience Certificate",
        kind: "file",
        optional: true,
      },
      {
        key: "electricity_bill",
        label: "Electricity Bill",
        kind: "file",
        optional: true,
        hint: "Address proof",
      },
    ],
  },
  {
    title: "Bank",
    fields: [
      { key: "bank_name", label: "Bank Name" },
      { key: "bank_account_no", label: "Account Number", mask: true },
      { key: "ifsc_code", label: "IFSC" },
    ],
  },
];

export const ALL_KYC_FIELDS = KYC_GROUPS.flatMap((g) => g.fields);
export const KYC_LABEL = Object.fromEntries(
  ALL_KYC_FIELDS.map((f) => [f.key, f.label]),
);
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
/** Statuses where the record can't be edited directly (Classic's rule). */
export const UNEDITABLE = ["Approved", "Rejected", "Edit Requested"];
