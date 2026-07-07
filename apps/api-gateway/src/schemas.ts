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

// ── Face Descriptor ───────────────────────────────────────────────────────────

export const saveFaceDescriptorSchema = z.object({
  descriptor: z.array(z.number()).length(128),
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
  userId: z.string().min(1).max(64),
  date: z.string().max(32).optional(),
  timeIn: z.string().max(16).optional(),
  timeOut: z.string().max(16).optional(),
});

// ── Leave ─────────────────────────────────────────────────────────────────────

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

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
  username: z.string().min(1).max(64),
  assets: z.array(z.string()).optional(),
  employeeStatus: z.enum(["Active", "Terminated", "Absconded"]).optional(),
  pf_no: z.string().max(64).optional(),
  uan_no: z.string().max(64).optional(),
  esic_no: z.string().max(64).optional(),
  salary: z.number().min(0).optional(),
  salaryStructure: z
    .object({
      basicPay: z.number().min(0).nullable().optional(),
      hra: z.number().min(0).nullable().optional(),
      conveyance: z.number().min(0).nullable().optional(),
      pf: z.number().min(0).nullable().optional(),
      esi: z.number().min(0).nullable().optional(),
      pt: z.number().min(0).nullable().optional(),
    })
    .optional(),
  reasonForTermination: z.string().max(512).optional(),
  dateOfTermination: z.string().optional(),
  dateOfAbscond: z.string().optional(),
  wfh: z.boolean().optional(),
});

export const completeKycSchema = z.object({
  username: z.string().max(64).optional(),
  employee_photo: z.string().max(4096).optional(),
  dob: z.string().max(32).optional(),
  blood_group: z.string().max(16).optional(),
  qualification: z.string().max(256).optional(),
  mobile: z.string().max(16).optional(),
  email: z.string().email().max(256).optional(),
  official_email: z.string().email().max(256).optional(),
  permanent_address_line_1: z.string().max(256).optional(),
  permanent_address_line_2: z.string().max(256).optional(),
  permanent_address_city: z.string().max(128).optional(),
  permanent_address_state: z.string().max(128).optional(),
  permanent_address_pincode: z.string().max(16).optional(),
  communication_address_line_1: z.string().max(256).optional(),
  communication_address_line_2: z.string().max(256).optional(),
  communication_address_city: z.string().max(128).optional(),
  communication_address_state: z.string().max(128).optional(),
  communication_address_pincode: z.string().max(16).optional(),
  aadhar_no: z.string().max(20).optional(),
  aadhar_photo_front: z.string().max(4096).optional(),
  aadhar_photo_back: z.string().max(4096).optional(),
  pan_no: z.string().max(20).optional(),
  pan_photo: z.string().max(4096).optional(),
  education_certificates: z.array(z.string()).optional(),
  experience_certificate: z.string().max(4096).optional(),
  electricity_bill: z.string().max(4096).optional(),
  bank_account_no: z.string().max(32).optional(),
  bank_name: z.string().max(128).optional(),
  ifsc_code: z.string().max(16).optional(),
});

export const kycApprovalSchema = z.object({
  username: z.string().min(1).max(64),
  kyc_approval: z.enum(["Approved", "Rejected"]),
});

// ── Salary ────────────────────────────────────────────────────────────────────

export const updateSalarySchema = z.object({
  userId: z.string().min(1).max(64),
  year: z.string().regex(/^\d{4}$/),
  month: z.string().regex(/^(0?[1-9]|1[0-2])$/),
  salaryStructure: z.object({
    basicPay: z.number().nonnegative(),
    hra: z.number().nonnegative(),
    conveyance: z.number().nonnegative(),
    incentive: z.number().nonnegative(),
    pf: z.number().nonnegative(),
    esi: z.number().nonnegative(),
    pt: z.number().nonnegative(),
    deductions: z.number().nonnegative(),
    grossEarnings: z.number().optional(),
    netPayable: z.number().optional(),
  }),
});

// ── User ──────────────────────────────────────────────────────────────────────

export const saveFcmTokenSchema = z.object({
  fcmToken: z.string().max(512).optional(),
  deviceFingerprint: z.string().max(256).optional(),
  deviceInfo: z
    .object({
      browser: z.string().max(128).optional(),
      os: z.string().max(128).optional(),
      deviceType: z.string().max(64).optional(),
    })
    .optional(),
});

// ── Payroll ───────────────────────────────────────────────────────────────────

export const initiatePayrollRunSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  notes: z.string().max(1000).optional(),
});

export const updatePayrollRunStatusSchema = z.object({
  runId: z.string().min(1),
  status: z.enum(["processing", "approved", "disbursed", "cancelled"]),
  notes: z.string().max(1000).optional(),
});

export const requestSalaryAdvanceSchema = z.object({
  amount: z.number().positive().max(10_000_000),
  reason: z.string().min(1).max(1000),
  emiMonths: z.number().int().min(1).max(24),
});

export const updateSalaryAdvanceStatusSchema = z.object({
  advanceId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  emiAmount: z.number().positive().optional(), // required when action=approve
});

// ── Assets ────────────────────────────────────────────────────────────────────

export const createAssetSchema = z.object({
  assetCode: z
    .string()
    .min(1)
    .max(32)
    .regex(
      /^[A-Z0-9-]+$/,
      "Asset code must be uppercase alphanumeric with hyphens",
    ),
  name: z.string().min(1).max(256),
  category: z.enum([
    "Laptop",
    "Phone",
    "Monitor",
    "Furniture",
    "Vehicle",
    "Other",
  ]),
  brand: z.string().max(128).optional(),
  model: z.string().max(128).optional(),
  serialNumber: z.string().max(128).optional(),
  purchaseDate: z.string().optional(),
  purchaseValue: z.number().nonnegative().optional(),
  condition: z.enum(["good", "fair", "damaged"]).optional(),
  notes: z.string().max(1000).optional(),
});

export const updateAssetSchema = createAssetSchema
  .omit({ assetCode: true })
  .extend({
    status: z
      .enum(["available", "assigned", "maintenance", "retired"])
      .optional(),
  })
  .partial();

export const assignAssetSchema = z.object({
  assetId: z.string().min(1),
  userId: z.string().min(1),
  expectedReturn: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const returnAssetSchema = z.object({
  assetId: z.string().min(1),
  conditionIn: z.enum(["good", "fair", "damaged"]),
  notes: z.string().max(500).optional(),
});

export const acknowledgeAssignmentSchema = z.object({
  note: z.string().max(500).optional(),
});

export const reportAssetIssueSchema = z.object({
  assetId: z.string().min(1),
  type: z.enum([
    "malfunction",
    "damage",
    "lost",
    "stolen",
    "return_request",
    "other",
  ]),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  title: z.string().min(1).max(256),
  description: z.string().min(1).max(2000),
});

export const updateAssetIssueStatusSchema = z.object({
  status: z.enum(["in_review", "approved", "rejected", "resolved"]),
  notes: z.string().max(1000).optional(),
});

// ── WFH Requests ─────────────────────────────────────────────────────────────

export const requestWfhSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  reason: z.string().max(500).optional(),
});

export const updateWfhStatusSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(["approve", "reject", "cancel"]),
  rejectionReason: z.string().max(500).optional(),
});

// ── Helpdesk ──────────────────────────────────────────────────────────────────

export const createTicketSchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().min(1).max(5000),
  category: z.enum(["IT", "Payroll", "Leave", "Onboarding", "HR", "Other"]),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  attachments: z.array(z.string().max(2048)).max(5).optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(1).max(256).optional(),
  description: z.string().min(1).max(5000).optional(),
  category: z
    .enum(["IT", "Payroll", "Leave", "Onboarding", "HR", "Other"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  assignedTo: z.string().optional(),
});

export const addTicketCommentSchema = z.object({
  comment: z.string().min(1).max(3000),
  isInternal: z.boolean().optional(),
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

const ALLOWED_WEBHOOK_EVENTS = [
  "employee.created",
  "employee.updated",
  "employee.terminated",
  "leave.applied",
  "leave.approved",
  "leave.rejected",
  "attendance.checkin",
  "attendance.absent",
  "payroll.approved",
  "payroll.disbursed",
  "resignation.submitted",
  "resignation.approved",
  "asset.assigned",
  "asset.returned",
  "asset.retired",
  "asset.issue_reported",
  "asset.issue_updated",
  "ticket.created",
  "ticket.resolved",
] as const;

export const createWebhookSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(ALLOWED_WEBHOOK_EVENTS)).min(1).max(20),
});

export const updateWebhookSchema = z.object({
  url: z.string().url().max(2048).optional(),
  events: z.array(z.enum(ALLOWED_WEBHOOK_EVENTS)).min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});

// ── Custom Reports ────────────────────────────────────────────────────────────

const reportFilterSchema = z.object({
  field: z.string().min(1).max(64),
  operator: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

export const runReportSchema = z.object({
  entity: z.enum([
    "employee",
    "attendance",
    "leave",
    "salary",
    "recruitment",
    "payroll",
  ]),
  filters: z.array(reportFilterSchema).max(10).optional(),
  columns: z.array(z.string().min(1).max(64)).min(1).max(20),
  groupBy: z.string().max(64).optional(),
  sort: z
    .object({
      field: z.string().max(64),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
  limit: z.number().int().min(1).max(10_000).default(1000),
  format: z.enum(["json", "csv"]).default("json"),
});

export const saveReportSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(1000).optional(),
  entity: z.enum([
    "employee",
    "attendance",
    "leave",
    "salary",
    "recruitment",
    "payroll",
  ]),
  config: z.object({
    filters: z.array(reportFilterSchema).max(10).optional(),
    columns: z.array(z.string()).min(1).max(20),
    groupBy: z.string().optional(),
    sort: z
      .object({ field: z.string(), direction: z.enum(["asc", "desc"]) })
      .optional(),
    limit: z.number().int().min(1).max(10_000).optional(),
  }),
  schedule: z.string().max(64).optional(), // cron expression
  recipients: z.array(z.string().email()).max(10).optional(),
});
