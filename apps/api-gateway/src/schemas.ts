import { z } from "zod";

// ── Auth ──────────────────────────────────────────────────────────────────────

export const webAuthnCredentialCheckSchema = z.object({
  username: z.string().min(1).max(64),
});

export const webAuthnLoginOptionsSchema = z.object({
  username: z.string().min(1).max(64),
});

export const webAuthnVerifyLoginSchema = z.object({
  username: z.string().min(1).max(64),
  credential: z.record(z.unknown()),
});

export const webAuthnLoginSchema = z.object({
  tempToken: z.string().min(1),
});

export const disableWebAuthnSchema = z
  .object({
    credentialId: z.string().optional(),
    disableAll: z.boolean().optional(),
  })
  .refine((d) => d.credentialId || d.disableAll, {
    message: "credentialId or disableAll required",
  });

export const webAuthnVerifyRegistrationSchema = z.object({
  credential: z.record(z.unknown()),
});

// ── HRM ───────────────────────────────────────────────────────────────────────

export const addHrActivitySchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().max(2000).optional(),
  date: z.string().max(32).optional(),
  time: z.string().max(32).optional(),
  status: z.string().max(64).optional(),
});

export const editHrActivitySchema = addHrActivitySchema.partial();

export const createRuleSchema = z.object({
  name: z.string().min(1).max(256),
  category: z.string().min(1).max(64),
  description: z.string().max(2000).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  status: z.enum(["draft", "active", "inactive"]).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  conditions: z.array(z.record(z.unknown())).optional(),
  conditionLogic: z.enum(["AND", "OR"]).optional(),
  actions: z.array(z.record(z.unknown())).optional(),
  effectiveFrom: z.string().max(64).optional(),
  effectiveTo: z.string().max(64).optional(),
});

export const updateRuleSchema = createRuleSchema.partial();

export const updateRuleStatusSchema = z.object({
  status: z.enum(["draft", "active", "inactive"]),
});

export const testRuleSchema = z.object({
  rule: z.record(z.unknown()),
  testData: z.record(z.unknown()),
});

export const createOrUpdatePolicySchema = z.object({
  policyType: z.string().min(1).max(128),
  policyName: z.string().max(256).optional(),
  content: z.string().min(1),
});

export const updatePolicySchema = z.object({
  policyType: z.string().max(128).optional(),
  policyName: z.string().max(256).optional(),
  content: z.string().optional(),
});

// ── Attendance ────────────────────────────────────────────────────────────────

export const addAttendanceSchema = z.object({
  type: z.string().min(1).max(32),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  deviceInfo: z.string().max(512).optional(),
  imageUrl: z.string().max(2048).optional(),
});

export const attendanceCorrectionSchema = z.object({
  username: z.string().min(1).max(64),
  date: z.string().max(32).optional(),
  timeIn: z.string().max(16).optional(),
  timeOut: z.string().max(16).optional(),
});

// ── Leave ─────────────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const addLeaveSchema = z.object({
  from: isoDate,
  to: isoDate,
  leaveType: z.string().min(1).max(64),
  reason: z.string().max(1000).optional(),
  sick_leave: z.boolean().optional(),
  medicalCertificate: z.string().max(2048).optional(),
});

export const updateLeaveStatusSchema = z.object({
  leaveId: z.string().min(1),
  action: z.enum(["approve", "reject", "cancel"]),
});

// ── Chat ──────────────────────────────────────────────────────────────────────

export const startConversationSchema = z.object({
  recipientUsername: z.string().min(1).max(64),
});

// ── Employee ──────────────────────────────────────────────────────────────────

export const editEmployeeDetailsSchema = z.object({
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional(),
  middleName: z.string().max(64).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  blood_group: z.string().max(8).optional(),
  mobile: z.string().max(20).optional(),
  official_email: z.string().email().max(256).optional(),
  designation: z.string().max(128).optional(),
  department: z.string().max(128).optional(),
  communication_address_line_1: z.string().max(256).optional(),
  communication_address_line_2: z.string().max(256).optional(),
  communication_address_city: z.string().max(64).optional(),
  communication_address_state: z.string().max(64).optional(),
  communication_address_pincode: z.string().max(16).optional(),
  permanent_address_line_1: z.string().max(256).optional(),
  permanent_address_line_2: z.string().max(256).optional(),
  permanent_address_city: z.string().max(64).optional(),
  permanent_address_state: z.string().max(64).optional(),
  permanent_address_pincode: z.string().max(16).optional(),
  wfh: z.boolean().optional(),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  employee_photo: z.string().max(4096).optional(),
});

export const completeKycSchema = z.object({
  aadharNo: z.string().max(20).optional(),
  aadharPhotoFront: z.string().max(4096).optional(),
  aadharPhotoBack: z.string().max(4096).optional(),
  panNo: z.string().max(20).optional(),
  panPhoto: z.string().max(4096).optional(),
  bankAccountNo: z.string().max(32).optional(),
  bankName: z.string().max(128).optional(),
  ifscCode: z.string().max(16).optional(),
  pfNo: z.string().max(32).optional(),
  uanNo: z.string().max(32).optional(),
  esicNo: z.string().max(32).optional(),
});

export const kycApprovalSchema = z.object({
  username: z.string().min(1).max(64),
  kyc_approval: z.boolean(),
});

// ── Salary ────────────────────────────────────────────────────────────────────

export const updateSalarySchema = z.object({
  userId: z.string().min(1).max(64),
  basicSalary: z.number().nonnegative(),
  components: z.array(z.record(z.unknown())).optional(),
  effectiveDate: z.string().max(32).optional(),
  createdBy: z.string().max(64).optional(),
});

// ── User ──────────────────────────────────────────────────────────────────────

export const saveFcmTokenSchema = z.object({
  fcmToken: z.string().max(512).optional(),
  deviceFingerprint: z.string().max(256).optional(),
  deviceInfo: z.object({
    browser: z.string().max(128).optional(),
    os: z.string().max(128).optional(),
    deviceType: z.string().max(64).optional(),
  }).optional(),
});
