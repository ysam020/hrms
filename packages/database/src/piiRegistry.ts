import type { BlindIndexNormalizer, FieldValueKind } from "@hrms/crypto";

/**
 * Every protected field in the schema, in one place. This map drives field
 * encryption, decryption, query rewriting, audit redaction, the server-side
 * validators and the migration. A test parses schema.prisma and fails when a
 * field is neither listed here nor marked as not sensitive.
 */

export type FieldRule =
  | {
      kind: FieldValueKind | "stringArray";
      blindIndex?: BlindIndexNormalizer;
      /** Stored value may still be the older AES-CBC form. */
      legacyCbc?: boolean;
      /** Written when a create omits the field. */
      default?: number;
    }
  | { kind: "compositeList"; fields: string[] }
  /** Stored as a keyed hash: matched by equality, never decrypted. */
  | { kind: "hmac" }
  /** Already one-way; the validator only checks the stored shape. */
  | { kind: "hash"; format: "bcrypt" | "hex" | "hexArray" };

export const PII_REGISTRY: Record<string, Record<string, FieldRule>> = {
  Tenant: {
    paymentMethodSummary: { kind: "string" },
    helpPhone: { kind: "string" },
    helpEmail: { kind: "string" },
    signatoryName: { kind: "string" },
  },
  TrialClaim: {
    key: { kind: "hmac" },
  },
  TenantJoinRequest: {
    email: { kind: "string", blindIndex: "email" },
    rejectionReason: { kind: "string" },
  },
  User: {
    username: { kind: "string", blindIndex: "exact" },
    password: { kind: "hash", format: "bcrypt" },
    email: { kind: "string", blindIndex: "email" },
    official_email: { kind: "string" },
    personalEmail: { kind: "string" },
    first_name: { kind: "string" },
    middle_name: { kind: "string" },
    last_name: { kind: "string" },
    mobile: { kind: "string" },
    dob: { kind: "date" },
    blood_group: { kind: "string" },
    wfhHomeLatitude: { kind: "number" },
    wfhHomeLongitude: { kind: "number" },
    wfhHomeName: { kind: "string" },
    note: { kind: "string" },
    reasonForTermination: { kind: "string" },
    employee_photo: { kind: "string" },
    face_descriptor: { kind: "json" },
    permanent_address_line_1: { kind: "string" },
    permanent_address_line_2: { kind: "string" },
    permanent_address_city: { kind: "string" },
    permanent_address_state: { kind: "string" },
    permanent_address_pincode: { kind: "string" },
    communication_address_line_1: { kind: "string" },
    communication_address_line_2: { kind: "string" },
    communication_address_city: { kind: "string" },
    communication_address_state: { kind: "string" },
    communication_address_pincode: { kind: "string" },
    aadhar_no: { kind: "string" },
    aadhar_photo_front: { kind: "string" },
    aadhar_photo_back: { kind: "string" },
    pan_no: { kind: "string" },
    pan_photo: { kind: "string" },
    education_certificates: { kind: "stringArray" },
    experience_certificate: { kind: "string" },
    electricity_bill: { kind: "string" },
    pf_no: { kind: "string" },
    uan_no: { kind: "string" },
    esic_no: { kind: "string" },
    bank_account_no: { kind: "string" },
    bank_name: { kind: "string" },
    ifsc_code: { kind: "string" },
    kyc_revision_notes: { kind: "json" },
    kyc_edit_request_reason: { kind: "string" },
    reference_by: { kind: "string" },
    refreshToken: { kind: "hash", format: "hex" },
    googleCalendarRefreshToken: { kind: "string", legacyCbc: true },
    webAuthnCredentials: { kind: "json" },
    fcmTokens: { kind: "json" },
    events: { kind: "json" },
  },
  OvertimeRequest: {
    reason: { kind: "string" },
  },
  LeaveApplication: {
    reason: { kind: "string" },
    sickLeave: { kind: "boolean" },
    medicalCertificate: { kind: "string" },
    cancellationReason: { kind: "string" },
  },
  Candidate: {
    name: { kind: "string" },
    email: { kind: "string", blindIndex: "email" },
    mobile: { kind: "string", blindIndex: "mobile" },
    currentLocation: { kind: "string" },
    linkedinUrl: { kind: "string" },
    portfolioUrl: { kind: "string" },
    githubUrl: { kind: "string" },
    skills: { kind: "string" },
    highestQualification: { kind: "string" },
  },
  ApplicationDraft: {
    email: { kind: "string", blindIndex: "email" },
    data: { kind: "json" },
    tokenHashes: { kind: "hash", format: "hexArray" },
    recoveryCodeHash: { kind: "hash", format: "hex" },
  },
  JobApplication: {
    name: { kind: "string" },
    mobile: { kind: "string" },
    email: { kind: "string", blindIndex: "email" },
    aadharNo: { kind: "string" },
    resume: { kind: "string" },
    interviews: { kind: "json" },
    reason: { kind: "string" },
    aiNotes: { kind: "string" },
    remarks: { kind: "string" },
    hireSalary: { kind: "number" },
    hireSalaryComponents: { kind: "json" },
    assignedOfficialEmail: { kind: "string", blindIndex: "email" },
    profile: { kind: "json" },
    screeningAnswers: { kind: "json" },
    coverLetter: { kind: "string" },
  },
  ApplicationStageEvent: {
    scorecards: { kind: "json" },
    bgvResult: { kind: "string" },
    notes: { kind: "string" },
  },
  Offer: {
    offeredCTC: { kind: "number" },
    candidateNote: { kind: "string" },
    internalNote: { kind: "string" },
  },
  Resignation: {
    reason: { kind: "string" },
    comments: { kind: "string" },
    rejectionReason: { kind: "string" },
    qualityOfCommunication: { kind: "string" },
    supportFromManager: { kind: "string" },
    appreciationForWork: { kind: "string" },
    collaborationWithinTheTeam: { kind: "string" },
    overallCompanyCulture: { kind: "string" },
    suggestions: { kind: "string" },
    buyoutAmount: { kind: "number" },
  },
  ResignationNoticeEvent: {
    reason: { kind: "string" },
  },
  ExitInterviewResponse: {
    answers: { kind: "json" },
  },
  ExitChecklistItemStatus: {
    notes: { kind: "string" },
  },
  FnfSettlement: {
    lineItems: { kind: "json" },
    leaveEncashmentAmount: { kind: "number", default: 0 },
    noticeShortfallDeduction: { kind: "number", default: 0 },
    grossPayable: { kind: "number" },
    totalDeductions: { kind: "number" },
    netPayable: { kind: "number" },
  },
  SalaryStructure: {
    grossSalary: { kind: "number" },
    basicPay: { kind: "number" },
    hra: { kind: "number" },
    conveyance: { kind: "number" },
    incentive: { kind: "number" },
    pf: { kind: "number" },
    esi: { kind: "number" },
    pt: { kind: "number" },
    deductions: { kind: "number" },
    advanceDeduction: { kind: "number" },
    tds: { kind: "number" },
    grossEarnings: { kind: "number" },
    netPayable: { kind: "number" },
    componentBreakdown: { kind: "json" },
  },
  TaxDeclaration: {
    monthlyRent: { kind: "number" },
    isMetroCity: { kind: "boolean" },
    lineItems: { kind: "json" },
    revisionNotes: { kind: "json" },
  },
  Notification: {
    message: { kind: "string" },
  },
  Message: {
    content: { kind: "string" },
    fileUrl: { kind: "string" },
    fileName: { kind: "string" },
  },
  AuditLog: {
    username: { kind: "string", blindIndex: "exact" },
    oldValue: { kind: "json" },
    newValue: { kind: "json" },
    ipAddress: { kind: "string" },
    userAgent: { kind: "string" },
  },
  ApprovalStepInstance: {
    comment: { kind: "string" },
  },
  ApprovalDelegate: {
    note: { kind: "string" },
  },
  LoginEvent: {
    ip: { kind: "string" },
    country: { kind: "string" },
    city: { kind: "string" },
    latitude: { kind: "number" },
    longitude: { kind: "number" },
    userAgent: { kind: "string" },
    deviceFingerprint: { kind: "string" },
    userEmail: { kind: "string" },
  },
  PayrollLineItem: {
    grossSalary: { kind: "number" },
    basicPay: { kind: "number", default: 0 },
    hra: { kind: "number", default: 0 },
    conveyance: { kind: "number", default: 0 },
    incentive: { kind: "number", default: 0 },
    pf: { kind: "number", default: 0 },
    esi: { kind: "number", default: 0 },
    pt: { kind: "number", default: 0 },
    advanceDeduction: { kind: "number", default: 0 },
    tds: { kind: "number", default: 0 },
    otherDeductions: { kind: "number", default: 0 },
    totalDeductions: { kind: "number", default: 0 },
    netPayable: { kind: "number" },
    componentBreakdown: { kind: "json" },
    payoutFailureReason: { kind: "string" },
  },
  SalaryAdvance: {
    amount: { kind: "number" },
    reason: { kind: "string" },
    emiAmount: { kind: "number" },
    remainingAmount: { kind: "number" },
  },
  PerformanceReview: {
    selfComments: { kind: "string" },
    selfRating: { kind: "number" },
    managerComments: { kind: "string" },
    managerRating: { kind: "number" },
    overallRating: { kind: "number" },
    recommendedIncrementPct: { kind: "number" },
  },
  AssetAssignment: {
    notes: { kind: "string" },
    acknowledgedNote: { kind: "string" },
  },
  WfhRequest: {
    reason: { kind: "string" },
    rejectionReason: { kind: "string" },
  },
  Ticket: {
    description: { kind: "string" },
    attachments: { kind: "stringArray" },
  },
  TicketComment: {
    comment: { kind: "string" },
  },
  SavedReport: {
    recipients: { kind: "stringArray" },
  },
  PresenceStatus: {
    message: { kind: "string" },
    previousMessage: { kind: "string" },
  },
  McpGrant: {
    refreshTokenHash: { kind: "hash", format: "hex" },
    prevRefreshTokenHash: { kind: "hash", format: "hex" },
  },
  SupportTicket: {
    description: { kind: "string" },
    details: { kind: "json" },
  },
  SupportMessage: {
    body: { kind: "string" },
  },
  SupportAttachment: {
    fileName: { kind: "string" },
  },
  SupportActivity: {
    metadata: { kind: "json" },
  },
  BillingPayment: {
    errorDescription: { kind: "string" },
  },
  WebhookInboxEvent: {
    payload: { kind: "string" },
  },
  Lead: {
    name: { kind: "string" },
    email: { kind: "string", blindIndex: "email" },
    phone: { kind: "string" },
    designation: { kind: "string" },
    message: { kind: "string" },
    notes: { kind: "compositeList", fields: ["body"] },
  },
};
