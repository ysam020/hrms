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

export const addHrActivitySchema = z
  .object({
    title: z.string().min(1).max(256),
    description: z.string().max(2000).optional(),
    date: z.string().max(32).optional(),
    time: z.string().max(32).optional(),
    status: z.string().max(64).optional(),
  })
  .strict();

export const editHrActivitySchema = addHrActivitySchema.partial().strict();

export const createOrUpdatePolicySchema = z
  .object({
    policyType: z.string().min(1).max(128),
    policyName: z.string().max(256).optional(),
    content: z.string().min(1),
  })
  .strict();

export const updatePolicySchema = z
  .object({
    policyType: z.string().max(128).optional(),
    policyName: z.string().max(256).optional(),
    content: z.string().optional(),
  })
  .strict();

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

export const addLeaveSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    leaveType: z.string().min(1).max(64),
    reason: z.string().max(1000).optional(),
    sick_leave: z.boolean().optional(),
    medicalCertificate: z.string().max(2048).optional(),
    unit: z.enum(["full_day", "half_day", "short_leave"]).default("full_day"),
    session: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(["first_half", "second_half"]).optional(),
    ),
    shortLeaveHours: z.number().min(0.5).max(7).optional(),
  })
  .refine((v) => v.unit !== "half_day" || !!v.session, {
    message: "session is required for a half-day leave",
    path: ["session"],
  })
  .refine((v) => v.unit !== "short_leave" || !!v.shortLeaveHours, {
    message: "shortLeaveHours is required for short leave",
    path: ["shortLeaveHours"],
  });

export const updateLeaveStatusSchema = z.object({
  leaveId: z.string().min(1),
  action: z.enum(["approve", "reject", "cancel"]),
  reason: z.string().max(500).optional(),
});

// ── Chat ──────────────────────────────────────────────────────────────────────

export const startConversationSchema = z.object({
  recipientUserId: z.string().min(1).max(64),
});

// ── Employee ──────────────────────────────────────────────────────────────────

export const editEmployeeDetailsSchema = z.object({
  username: z.string().min(1).max(64),
  employeeStatus: z.enum(["Active", "Terminated", "Absconded"]).optional(),
  pf_no: z.string().max(64).optional(),
  uan_no: z.string().max(64).optional(),
  esic_no: z.string().max(64).optional(),
  reasonForTermination: z.string().max(512).optional(),
  dateOfTermination: z.string().optional(),
  dateOfAbscond: z.string().optional(),
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

export const kycApprovalSchema = z
  .object({
    username: z.string().min(1).max(64),
    kyc_approval: z.enum(["Approved", "Revision Requested"]),
    // { [fieldName]: issue description } — required when requesting a
    // revision, ignored otherwise.
    field_issues: z.record(z.string().min(1).max(500)).optional(),
  })
  .refine(
    (data) =>
      data.kyc_approval !== "Revision Requested" ||
      (data.field_issues && Object.keys(data.field_issues).length > 0),
    {
      message: "field_issues is required when requesting a revision",
      path: ["field_issues"],
    },
  );

export const requestKycEditAccessSchema = z.object({
  reason: z.string().min(1).max(500),
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
  // Free text, not a fixed enum — see AssetCategory / createAssetCategorySchema.
  category: z.string().min(1).max(64),
  brand: z.string().max(128).optional(),
  model: z.string().max(128).optional(),
  serialNumber: z.string().max(128).optional(),
  purchaseDate: z.string().optional(),
  purchaseValue: z.number().nonnegative().optional(),
  condition: z.enum(["good", "fair", "damaged"]).optional(),
  notes: z.string().max(1000).optional(),
});

// "assigned" is deliberately excluded — that transition only happens via
// POST /assets/assign, which also creates the backing AssetAssignment row.
// Allowing it here let an asset be forced into "assigned" with no assignment
// behind it, a stuck state neither assign nor return could recover from.
export const updateAssetSchema = createAssetSchema
  .omit({ assetCode: true })
  .extend({
    status: z.enum(["available", "maintenance", "retired"]).optional(),
  })
  .partial();

export const assignAssetSchema = z.object({
  assetId: z.string().min(1),
  userId: z.string().min(1),
  expectedReturn: z.string().optional(),
  conditionOut: z.enum(["good", "fair", "damaged"]).optional(),
  notes: z.string().max(500).optional(),
});

export const returnAssetSchema = z.object({
  assetId: z.string().min(1),
  conditionIn: z.enum(["good", "fair", "damaged"]),
  notes: z.string().max(500).optional(),
});

export const createAssetCategorySchema = z.object({
  name: z.string().min(1).max(64),
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
  // Omit for a single-day request — defaults to `date` in the handler.
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "toDate must be YYYY-MM-DD")
    .optional(),
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

// ── Approval Chains ──────────────────────────────────────────────────────────

export const approvalChainStepSchema = z.object({
  approverType: z.enum([
    "reporting_manager",
    "specific_user",
    "role",
    "team_leader",
  ]),
  approverUserId: z.string().min(1).optional(),
  approverRole: z
    .enum(["owner", "admin", "hr", "manager", "employee"])
    .optional(),
});

export const createApprovalChainSchema = z.object({
  module: z.enum(["leave", "resignation", "wfh", "salary_advance", "overtime"]),
  name: z.string().min(1).max(120),
  conditionField: z.string().max(60).optional(),
  conditionOp: z.enum(["gte", "lte", "eq", "in"]).optional(),
  conditionValue: z.any().optional(),
  priority: z.number().int().min(0).max(100).default(0),
  steps: z.array(approvalChainStepSchema).min(1).max(10),
});

export const updateApprovalChainSchema = createApprovalChainSchema
  .partial()
  .extend({
    isActive: z.boolean().optional(),
  });

export const createApprovalDelegateSchema = z.object({
  delegateId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  module: z
    .enum(["leave", "resignation", "wfh", "salary_advance", "overtime"])
    .optional(),
  note: z.string().max(500).optional(),
});

export const actOnApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(1000).optional(),
  // Module-specific extra decision fields (e.g. resignation's lastWorkingDay,
  // buyoutAmount) — validated per-module inside the side effect, not here.
  metadata: z.record(z.string(), z.any()).optional(),
});

export const startBreakSchema = z.object({
  breakType: z.enum(["lunch", "short_break", "other"]).default("lunch"),
  isPaid: z.boolean().default(false),
});

export const requestOvertimeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  plannedHours: z.number().min(0.5).max(12),
  reason: z.string().max(500).optional(),
});

// ── Comp-off credits ─────────────────────────────────────────────────────────

export const createCompOffCreditSchema = z.object({
  userId: z.string().min(1),
  sourceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  earnedDays: z.number().min(0.5).max(3).default(1),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
});

// ── Leave policy ──────────────────────────────────────────────────────────────

export const updateLeavePolicySchema = z.object({
  leavePolicies: z.array(z.record(z.any())).max(30),
});

export const requestLeaveCancellationSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ── Notice period policy ─────────────────────────────────────────────────────

export const createNoticePeriodPolicySchema = z
  .object({
    minTenureMonths: z.number().int().min(0).default(0),
    maxTenureMonths: z.number().int().min(0).optional(),
    designation: z.string().max(120).optional(),
    department: z.string().max(120).optional(),
    noticePeriodDays: z.number().int().min(0).max(180),
    isProbationPolicy: z.boolean().default(false),
    priority: z.number().int().min(0).max(100).default(0),
  })
  .strict();

export const updateNoticePeriodPolicySchema = createNoticePeriodPolicySchema
  .partial()
  .strict();

// ── Exit interview template ──────────────────────────────────────────────────

export const exitInterviewQuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(300),
  type: z.enum(["rating", "text", "boolean"]),
  required: z.boolean().default(false),
});

export const updateExitInterviewTemplateSchema = z.object({
  questions: z.array(exitInterviewQuestionSchema).max(30),
});

export const submitExitInterviewResponseSchema = z.object({
  answers: z
    .array(z.object({ questionId: z.string().min(1), value: z.any() }))
    .max(30),
});

// ── Exit checklist ────────────────────────────────────────────────────────────

export const createExitChecklistItemSchema = z
  .object({
    label: z.string().min(1).max(200),
    owningRole: z.enum(["IT", "Finance", "HR", "Admin", "Manager"]),
    isRequired: z.boolean().default(true),
    order: z.number().int().min(0).default(0),
  })
  .strict();

export const updateExitChecklistItemSchema = createExitChecklistItemSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();

export const updateExitChecklistStatusSchema = z
  .object({
    isComplete: z.boolean(),
    notes: z.string().max(500).optional(),
  })
  .strict();

// ── Resignation extensions ───────────────────────────────────────────────────

// resignationDate/lastDate stay optional here to match the existing minimal
// submission form (today it only collects `reason`) — the handler defaults
// resignationDate to now() server-side. Only the new exitType field is
// actually enforced.
export const submitResignationSchema = z.object({
  resignationDate: z.string().optional(),
  lastDate: z.string().optional(),
  reason: z.string().max(2000).optional(),
  overallJobSatisfaction: z.union([z.string(), z.number()]).optional(),
  suggestions: z.string().max(2000).optional(),
  exitType: z
    .enum(["voluntary", "termination", "absconding", "mutual"])
    .default("voluntary"),
});

export const renegotiateNoticeSchema = z.object({
  newLastWorkingDay: z.string().min(1),
  reason: z.string().max(500).optional(),
});

// ── Interview pipeline templates ────────────────────────────────────────────────

export const interviewPipelineStageSchema = z.object({
  order: z.number().int().min(1),
  name: z.string().min(1).max(120),
  interviewerRole: z.string().max(60).optional(),
  outcomeOptions: z
    .array(z.string())
    .min(1)
    .max(10)
    .default(["pass", "fail", "hold"]),
  isBgvStage: z.boolean().default(false),
  bgvVendor: z.string().max(120).optional(),
});

export const createInterviewPipelineTemplateSchema = z.object({
  name: z.string().min(1).max(160),
  stages: z.array(interviewPipelineStageSchema).min(1).max(15),
  isDefault: z.boolean().default(false),
});

export const updateInterviewPipelineTemplateSchema =
  createInterviewPipelineTemplateSchema
    .partial()
    .extend({ isActive: z.boolean().optional() });

export const advanceApplicationStageSchema = z.object({
  stageName: z.string().min(1).max(120),
  stageOrder: z.number().int().min(0),
  outcome: z.enum(["pass", "fail", "hold", "pending"]).optional(),
  interviewerId: z.string().optional(),
  scorecards: z
    .array(
      z.object({
        interviewerId: z.string(),
        score: z.number().optional(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .max(10)
    .optional(),
  bgvVendor: z.string().max(120).optional(),
  bgvResult: z.enum(["clear", "flagged", "pending"]).optional(),
  scheduledAt: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const bulkAdvanceStageSchema = z.object({
  applicationIds: z.array(z.string().min(1)).min(1).max(200),
  stageName: z.string().min(1).max(120),
  stageOrder: z.number().int().min(0),
  outcome: z.enum(["pass", "fail", "hold", "pending"]).optional(),
});

export const createOfferSchema = z.object({
  designation: z.string().max(160).optional(),
  department: z.string().max(160).optional(),
  offeredCTC: z.number().min(0).optional(),
  joiningDate: z.string().optional(),
  candidateNote: z.string().max(2000).optional(),
  internalNote: z.string().max(2000).optional(),
});

export const updateOfferStatusSchema = z.object({
  status: z.enum([
    "Draft",
    "Sent",
    "Negotiating",
    "Accepted",
    "Declined",
    "Withdrawn",
    "Expired",
  ]),
});

// ── Payroll components ───────────────────────────────────────────────────────

export const createSalaryComponentSchema = z
  .object({
    name: z.string().min(1).max(120),
    code: z.string().min(1).max(60),
    type: z.enum(["earning", "deduction"]),
    isTaxable: z.boolean().default(true),
    calcType: z.enum(["fixed", "percent_of_basic", "formula"]).default("fixed"),
    percentOf: z.string().max(60).optional(),
    percentValue: z.number().min(0).optional(),
    isRecurring: z.boolean().default(true),
    displayOrder: z.number().int().min(0).default(0),
  })
  .strict();

export const updateSalaryComponentSchema = createSalaryComponentSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();

export const createPtSlabSchema = z
  .object({
    state: z.string().min(1).max(60),
    minGross: z.number().min(0),
    maxGross: z.number().min(0).optional(),
    monthlyPT: z.number().min(0),
  })
  .strict();

export const updatePtSlabSchema = createPtSlabSchema.partial().strict();

export const createIncomeTaxSlabSchema = z
  .object({
    financialYear: z.string().min(1).max(20),
    regime: z.enum(["old", "new"]),
    minIncome: z.number().min(0),
    maxIncome: z.number().min(0).optional(),
    ratePercent: z.number().min(0).max(100),
  })
  .strict();

export const updateIncomeTaxSlabSchema = createIncomeTaxSlabSchema
  .partial()
  .strict();

// ── Tax declarations (Old Regime) ────────────────────────────────────────────

const taxDeclarationLineItemSchema = z.object({
  code: z.enum([
    "SEC80C",
    "SEC80D_SELF",
    "SEC80D_PARENTS",
    "HOME_LOAN_INTEREST",
    "NPS_80CCD1B",
    "OTHER",
  ]),
  label: z.string().max(120).optional(),
  declaredAmount: z.number().min(0),
  proofAmount: z.number().min(0).optional(),
});

export const saveDraftDeclarationSchema = z.object({
  financialYear: z.string().min(1).max(20).optional(),
  monthlyRent: z.number().min(0).optional(),
  isMetroCity: z.boolean().optional(),
  lineItems: z.array(taxDeclarationLineItemSchema).optional(),
});

export const submitDeclarationSchema = z.object({
  financialYear: z.string().min(1).max(20).optional(),
});

export const submitDeclarationProofsSchema = z.object({
  financialYear: z.string().min(1).max(20).optional(),
  proofs: z.record(z.number().min(0)),
});

export const reviewDeclarationSchema = z.object({
  userId: z.string().min(1),
  financialYear: z.string().min(1).max(20),
  decision: z.enum(["Declared", "RevisionRequested"]),
  revisionNotes: z.record(z.string()).optional(),
});

export const reviewDeclarationProofsSchema = z.object({
  userId: z.string().min(1),
  financialYear: z.string().min(1).max(20),
  decision: z.enum(["Verified", "ProofRevisionRequested"]),
  revisionNotes: z.record(z.string()).optional(),
});

export const createPayCycleSchema = z
  .object({
    name: z.string().min(1).max(120),
    frequency: z.enum(["monthly", "biweekly", "weekly"]).default("monthly"),
    payDay: z.number().int().min(1).max(31),
    isDefault: z.boolean().default(false),
  })
  .strict();

export const updatePayCycleSchema = createPayCycleSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();

// ── Org structure ────────────────────────────────────────────────────────────

export const createDepartmentSchema = z
  .object({
    name: z.string().min(1).max(160),
    headUserId: z.string().optional(),
  })
  .strict();
export const updateDepartmentSchema = createDepartmentSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();

export const createDesignationSchema = z
  .object({
    name: z.string().min(1).max(160),
    departmentId: z.string().optional(),
    level: z.number().int().min(0).optional(),
  })
  .strict();
export const updateDesignationSchema = createDesignationSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();

// ── Onboarding checklist ─────────────────────────────────────────────────────

export const updateOnboardingChecklistItemSchema = z.object({
  status: z.enum(["completed", "skipped"]),
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

// ── Performance Review ────────────────────────────────────────────────────────

export const createCycleSchema = z.object({
  name: z.string().min(1).max(256),
  periodStart: z.string().datetime({ offset: true }).or(z.string().min(1)),
  periodEnd: z.string().datetime({ offset: true }).or(z.string().min(1)),
  ratingScale: z.number().int().min(1).max(10).optional(),
  userIds: z.array(z.string().min(1)).min(1).max(1000),
});

export const updateCycleSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  periodStart: z
    .string()
    .datetime({ offset: true })
    .or(z.string().min(1))
    .optional(),
  periodEnd: z
    .string()
    .datetime({ offset: true })
    .or(z.string().min(1))
    .optional(),
  ratingScale: z.number().int().min(1).max(10).optional(),
  userIds: z.array(z.string().min(1)).max(1000).optional(),
});

export const updateCycleStatusSchema = z.object({
  status: z.enum(["active", "closed", "deleted"]),
});

export const submitSelfAssessmentSchema = z.object({
  selfComments: z.string().max(5000).optional(),
  selfRating: z.number().min(0).max(10),
});

export const submitManagerReviewSchema = z.object({
  managerComments: z.string().max(5000).optional(),
  managerRating: z.number().min(0).max(10),
  overallRating: z.number().min(0).max(10),
  recommendedIncrementPct: z.number().min(0).max(100).optional(),
  effectiveFrom: z.string().min(1).optional(),
});
