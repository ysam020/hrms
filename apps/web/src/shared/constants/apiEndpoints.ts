const NOTIFICATIONS = {
  GET_NOTIFICATIONS: "/get-notifications",
  CLEAR_NOTIFICATION: (id: string | number) => `/clear-notification/${id}`,
  CLEAR_ALL_NOTIFICATIONS: "/clear-all-notifications",
  DISABLE_PUSH_NOTIFICATIONS: "/disable-push-notifications",
  SAVE_FCM_TOKEN: "/save-fcm-token",
};

const PERMISSIONS = {
  ADD_TEAM_MEMBERS: "/add-team-members",
  CREATE_ROLE: "/create-role",
  UPDATE_ROLE_PERMISSIONS: (id: string | number) =>
    `/update-role-permissions/${id}`,
  DELETE_ROLE: (id: string | number) => `/delete-role/${id}`,
  DELETE_USER_ROLE: "/delete-user-role",
  CREATE_TEAM: "/create-team",
  DELETE_TEAM: (id: string | number) => `/delete-team/${id}`,
  DELETE_USER_FROM_TEAM: "/delete-user-from-team",
  UPDATE_SUPERUSER: (user: string) => `/update-superuser/${user}`,
  SAVE_USER_PERMISSIONS: "/save-user-permissions",
  GET_USER_PERMISSIONS: (user: string) => `/get-user-permissions/${user}`,
};

const CALENDAR = {
  DELETE_CALENDAR_EVENT: (id: string | number) =>
    `/delete-calendar-event/${id}`,
  GET_CALENDAR_EVENTS: "/get-calendar-events",
  EDIT_CALENDAR_EVENT: (id: string | number) => `/edit-calendar-event/${id}`,
  ADD_EVENT: "/add-event",
};

const ATTENDANCE = {
  ADD_ATTENDANCE: "/add-attendance",
  ATTENDANCE_CORRECTION: "/attendance-correction",
  GET_ATTENDANCE_SUMMARY: (userId: string, year: number, month: number) =>
    `/get-attendance-summary/${userId}/${year}/${month}`,
  GET_ALL_ATTENDANCES: (
    year: number,
    month: number,
    page: number,
    limit: number,
  ) => `/get-all-attendances/${year}/${month}?page=${page}&limit=${limit}`,
  GET_EMPLOYEE_ATTENDANCE: (year: number, month: number) =>
    `/get-attendances/${year}/${month}`,
};

const LEAVE = {
  ADD_LEAVE: "/add-leave",
  GET_LEAVE_APPLICATIONS: (params: string) =>
    `/get-leave-applications?${params}`,
  UPDATE_LEAVE_STATUS: "/update-leave-status",
};

const KYC = {
  EDIT_KYC: "/edit-kyc",
  COMPLETE_KYC: "/complete-kyc",
  GET_KYC_INSIGHTS: "/get-kyc-insights",
  KYC_APPROVAL: "/kyc-approval",
  VIEW_ALL_KYCS: (page: number, limit: number, params = "") =>
    `/view-all-kycs?page=${page}&limit=${limit}${params}`,
  REQUEST_KYC_EDIT_ACCESS: "/request-kyc-edit-access",
  ALLOW_KYC_EDIT: "/allow-kyc-edit",
};

const EMPLOYEE = {
  EMPLOYEE_INSIGHTS: "/employee-insights",
  EDIT_EMPLOYEE_DETAILS: `/edit-employee-details`,
  GET_ALL_USERS: (limit = 500) => `/get-all-users?limit=${limit}`,
};

const HOLIDAYS = {
  ADD_HOLIDAY: "/add-holiday",
  DELETE_HOLIDAY: "/delete-holiday",
  BULK_DELETE_HOLIDAYS: "/bulk-delete-holidays",
  GET_HOLIDAYS: (year: number) => `/get-holidays/${year}`,
  GET_BIRTHDAYS_ANNIVERSARIES: (month: number, year: number) =>
    `/birthdays-anniversaries?month=${month}&year=${year}`,
};

const HR_ACTIVITIES = {
  ADD_HR_ACTIVITY: "/add-hr-activity",
  EDIT_HR_ACTIVITY: (id: string | number) => `/edit-hr-activity/${id}`,
  GET_HR_ACTIVITIES: (page = 1, limit = 10, statusFilter = "Active") =>
    `/get-hr-activities?page=${page}&limit=${limit}&status=${statusFilter}`,
  DELETE_HR_ACTIVITY: (id: string | number) => `/delete-hr-activity/${id}`,
  BULK_DELETE_HR_ACTIVITIES: "/bulk-delete-hr-activities",
};

const JOB_OPENINGS = {
  ADD_JOB_OPENING: "/add-job-opening",
  EDIT_JOB_OPENING: (id: string | number) => `/edit-job-opening/${id}`,
  VIEW_JOB_OPENINGS: (page: number, limit: number, params = "") =>
    `/view-job-openings?page=${page}&limit=${limit}${params}`,
  DELETE_JOB_OPENING: (id: string | number) => `/delete-job-opening/${id}`,
  BULK_DELETE_JOB_OPENINGS: "/bulk-delete-job-openings",
  GET_ALL_JOB_OPENINGS: (slug: string) => `/public/careers/${slug}`,
  GET_PUBLIC_JOB_OPENING: (slug: string, id: string) =>
    `/public/careers/${slug}/job/${id}`,
  GET_JOB_TITLES: "/get-job-titles",
  APPLY_FOR_JOB: (slug: string) => `/apply-for-job/${slug}`,
  RESUME_UPLOAD_URL: (slug: string) =>
    `/public/careers/${slug}/resume-upload-url`,
  HIRE_CANDIDATE: "/hire-candidate",
  UPDATE_ASSIGNED_OFFICIAL_EMAIL: "/update-assigned-official-email",
  REJECT_CANDIDATE: "/reject-application",
  UPDATE_CANDIDATE_STATUS: "/update-candidate-status",
  SCHEDULE_INTERVIEW: "/schedule-interview",
  RESCHEDULE_INTERVIEW: "/reschedule-interview",
  REASSIGN_INTERVIEWER: "/reassign-interviewer",
  GET_INTERVIEWER_LIST: "/get-interviewer-list",
  JOB_OPENINGS_INSIGHTS: "/job-openings-insights",
  LIST_DESIGNATIONS: "/designations",
  CREATE_DESIGNATION: "/designations",
  GOOGLE_CALENDAR_CONNECT: "/auth/google-calendar/connect",
  GOOGLE_CALENDAR_STATUS: "/auth/google-calendar/status",
};

const RESIGNATION = {
  ADD_EXIT_FEEDBACK: "/add-exit-feedback",
  RESIGNATION_INSIGHTS: "/resignation-insights",
  ADD_RESIGNATION: "/add-resignation",
  GET_MY_RESIGNATION: "/my-resignation",
  VIEW_RESIGNATIONS: (page: number, limit: number, params = "") =>
    `/view-resignations?page=${page}&limit=${limit}${params}`,
  UPDATE_RESIGNATION: (id: string | number) => `/update-resignation/${id}`,
  APPROVE_RESIGNATION: (id: string) => `/approve-resignation/${id}`,
  REJECT_RESIGNATION: (id: string) => `/reject-resignation/${id}`,
  BULK_APPROVE_RESIGNATIONS: "/bulk-approve-resignations",
  BULK_REJECT_RESIGNATIONS: "/bulk-reject-resignations",
  WITHDRAW_RESIGNATION: (id: string) => `/withdraw-resignation/${id}`,
  GET_RESIGNATION_CHECKLIST: (id: string) => `/resignations/${id}/checklist`,
  UPDATE_RESIGNATION_CHECKLIST_ITEM: (id: string, itemDefId: string) =>
    `/resignations/${id}/checklist/${itemDefId}`,
  RENEGOTIATE_NOTICE: (id: string) => `/resignations/${id}/renegotiate-notice`,
  RESIGNATION_NOTICE_EVENTS: (id: string) =>
    `/resignations/${id}/notice-events`,
  SET_REHIRE_ELIGIBILITY: (id: string) =>
    `/resignations/${id}/rehire-eligibility`,
  COMPUTE_FNF_SETTLEMENT: (id: string) => `/resignations/${id}/fnf-settlement`,
  APPROVE_FNF_SETTLEMENT: (id: string) =>
    `/resignations/${id}/fnf-settlement/approve`,
  SUBMIT_EXIT_INTERVIEW_RESPONSE: (id: string) =>
    `/resignations/${id}/exit-interview-response`,
};

const ONBOARDING = {
  GET_ONBOARDING_CHECKLIST: "/onboarding-checklist",
  UPDATE_ONBOARDING_CHECKLIST_ITEM: (stepKey: string) =>
    `/onboarding-checklist/${stepKey}`,
};

const BULK_ONBOARDING = {
  BULK_ONBOARDING_TEMPLATE: "/bulk-onboarding/template",
  BULK_ONBOARDING_UPLOAD_URL: "/bulk-onboarding/upload-url",
  BULK_ONBOARDING_VALIDATE: "/bulk-onboarding/validate",
  BULK_ONBOARDING_COMMIT: "/bulk-onboarding/commit",
};

const PAYROLL_COMPONENTS = {
  LIST_SALARY_COMPONENTS: "/salary-component-definitions",
  CREATE_SALARY_COMPONENT: "/salary-component-definitions",
  UPDATE_SALARY_COMPONENT: (id: string) =>
    `/salary-component-definitions/${id}`,
  DELETE_SALARY_COMPONENT: (id: string) =>
    `/salary-component-definitions/${id}`,
  LIST_PT_SLABS: "/pt-slabs",
  CREATE_PT_SLAB: "/pt-slabs",
  UPDATE_PT_SLAB: (id: string) => `/pt-slabs/${id}`,
  DELETE_PT_SLAB: (id: string) => `/pt-slabs/${id}`,
  LIST_PAY_CYCLES: "/pay-cycles",
  CREATE_PAY_CYCLE: "/pay-cycles",
  UPDATE_PAY_CYCLE: (id: string) => `/pay-cycles/${id}`,
  DELETE_PAY_CYCLE: (id: string) => `/pay-cycles/${id}`,
  LIST_TDS_SLABS: "/tds-slabs",
  CREATE_TDS_SLAB: "/tds-slabs",
  UPDATE_TDS_SLAB: (id: string) => `/tds-slabs/${id}`,
  DELETE_TDS_SLAB: (id: string) => `/tds-slabs/${id}`,
};

const TAX_DECLARATION = {
  GET_MY_DECLARATION: (financialYear: string) =>
    `/tax-declarations/mine?financialYear=${financialYear}`,
  SAVE_DRAFT_DECLARATION: "/tax-declarations/draft",
  SUBMIT_DECLARATION: "/tax-declarations/submit",
  SUBMIT_DECLARATION_PROOFS: "/tax-declarations/proofs",
  LIST_DECLARATIONS: (
    financialYear: string,
    page: number,
    limit: number,
    params = "",
  ) =>
    `/tax-declarations?financialYear=${financialYear}&page=${page}&limit=${limit}${params}`,
  GET_PENDING_DECLARATIONS: "/tax-declarations/pending",
  GET_DECLARATION_FOR_REVIEW: (userId: string, financialYear: string) =>
    `/tax-declarations/${userId}?financialYear=${financialYear}`,
  REVIEW_DECLARATION: "/tax-declarations/review",
  REVIEW_DECLARATION_PROOFS: "/tax-declarations/review-proofs",
};

const RECRUITMENT_PIPELINE = {
  LIST_INTERVIEW_PIPELINE_TEMPLATES: "/interview-pipeline-templates",
  CREATE_INTERVIEW_PIPELINE_TEMPLATE: "/interview-pipeline-templates",
  UPDATE_INTERVIEW_PIPELINE_TEMPLATE: (id: string) =>
    `/interview-pipeline-templates/${id}`,
  DELETE_INTERVIEW_PIPELINE_TEMPLATE: (id: string) =>
    `/interview-pipeline-templates/${id}`,
};

const EXIT_POLICY = {
  LIST_NOTICE_PERIOD_POLICIES: "/notice-period-policies",
  CREATE_NOTICE_PERIOD_POLICY: "/notice-period-policies",
  UPDATE_NOTICE_PERIOD_POLICY: (id: string) => `/notice-period-policies/${id}`,
  DELETE_NOTICE_PERIOD_POLICY: (id: string) => `/notice-period-policies/${id}`,
  GET_EXIT_INTERVIEW_TEMPLATE: "/exit-interview-templates",
  UPDATE_EXIT_INTERVIEW_TEMPLATE: "/exit-interview-templates",
  LIST_EXIT_CHECKLIST_DEFS: "/exit-checklist-item-defs",
  CREATE_EXIT_CHECKLIST_DEF: "/exit-checklist-item-defs",
  UPDATE_EXIT_CHECKLIST_DEF: (id: string) => `/exit-checklist-item-defs/${id}`,
  DELETE_EXIT_CHECKLIST_DEF: (id: string) => `/exit-checklist-item-defs/${id}`,
};

const SALARY_MANAGEMENT = {
  GET_USER_SALARY: (userId: string, year: number, month: number) =>
    `/get-user-salary/${userId}/${year}/${month}`,
  UPDATE_SALARY: "/update-salary",
};

const USER = {
  // Auth
  LOGOUT: "/logout",
  // Profile
  GET_PROFILE: "/profile",
  // Face
  CHECK_FACE_DESCRIPTOR: "/check-face-descriptor",
  SAVE_FACE_DESCRIPTOR: "/save-face-descriptor",
  // WebAuthn
  WEBAUTHN_CREDENTIALS: "/webauthn-credentials",
  WEBAUTHN_LOGIN_OPTIONS: "/webauthn-login-options",
  WEBAUTHN_CREDENTIAL_CHECK: "/webauthn-credential-check",
  DISABLE_WEBAUTHN: "/disable-webauthn",
  REGISTER_WEBAUTHN: "/webauthn-register",
  WEBAUTHN_VERIFY_LOGIN: "/webauthn-verify-login",
  WEBAUTHN_LOGIN: "/webauthn-login",
  WEBAUTHN_VERIFY_REGISTRATION: "/webauthn-verify-registration",
  // Salary
  GENERATE_SALARY_SLIP: (userId: string, year: number, month: number) =>
    `/generate-salary-slip/${userId}/${year}/${month}`,
};

const UPLOAD = {
  UPLOAD_FILES: (query: string) => `/upload-file${query}`,
  UPLOAD_PRESIGNED_URL: "/upload/presigned-url",
  UPLOAD_VIEW_URL: "/upload/view-url",
  RESUME_VIEW_URL: "/resume-view-url",
};

const CHAT = {
  GET_CONVERSATIONS: "/chat/conversations",
  START_CONVERSATION: "/chat/conversations/start",
  GET_MESSAGES: (roomId: string) => `/chat/conversations/${roomId}/messages`,
  MARK_AS_READ: (roomId: string) => `/chat/conversations/${roomId}/read`,
  GET_UNREAD_COUNTS: "/chat/unread-counts",
  UPLOAD_FILE: "/chat/upload",
  DELETE_MESSAGE: (messageId: string) => `/chat/messages/${messageId}`,
  DELETE_CONVERSATION: (roomId: string) => `/chat/conversations/${roomId}`,
  PIN_MESSAGE: (messageId: string) => `/chat/messages/${messageId}/pin`,
  GET_PINNED_MESSAGES: (roomId: string) =>
    `/chat/conversations/${roomId}/pinned`,
  OG_PREVIEW: (url: string) => `/og-preview?url=${encodeURIComponent(url)}`,
};

const POLICY = {
  CREATE_POLICY: "/policies",
  GET_POLICIES: (page = 1, limit = 10) =>
    `/policies?page=${page}&limit=${limit}`,
  UPDATE_POLICY: (id: string | number) => `/policies/${id}`,
  DELETE_POLICY: (id: string | number) => `/policies/${id}`,
  DOWNLOAD_POLICY_PDF: (id: string | number) => `/policies/${id}/pdf`,
};

const CHATBOT = {
  CHATBOT_MESSAGE: "/chatbot/message",
};

const AI_INSIGHTS = {
  AI_INSIGHTS: "/ai-insights",
};

const DEVELOPER = {
  DEVELOPER_STATUS: "/developer/status",
  DEVELOPER_VERIFY_STATUS: "/developer/verify-status",
  DEVELOPER_VERIFY_IDENTITY: "/developer/verify-identity",
  DEVELOPER_WEBAUTHN_OPTIONS: "/developer/verify-identity/webauthn-options",
  DEVELOPER_WEBAUTHN_VERIFY: "/developer/verify-identity/webauthn-verify",
  DEVELOPER_LOGS_STREAM: "/developer/logs/stream",
  DEVELOPER_LOGS_ALL: "/developer/logs/all",
};

const ORG_SETTINGS = {
  GET_ORG_SETTINGS: "/tenant-settings",
  UPDATE_ORG_SETTINGS: "/tenant-settings",
  CANCEL_PENDING_ORG_SETTINGS: (id: string) => `/tenant-settings/pending/${id}`,
};

const PAYMENT = {
  CREATE_SUBSCRIPTION: "/payment/create-subscription",
  CANCEL_SUBSCRIPTION: "/payment/cancel-subscription",
  REACTIVATE_SUBSCRIPTION: "/payment/reactivate-subscription",
  PENDING_SETUP: "/payment/pending-setup",
  PLAN_PRICING: "/payment/plan-pricing",
  CHANGE_PLAN: "/payment/change-plan",
  CONFIRM_PLAN_UPGRADE: "/payment/confirm-plan-upgrade",
};

const TENANT = {
  ORG_PROFILE: "/tenants/org-profile",
  COMPLETE_PENDING_SETUP: "/tenants/complete-pending-setup",
  COMPLETE_ORG_SETUP: "/tenants/complete-org-setup",
  SELECT_TENANT: "/tenants/select",
  MY_TENANT: "/tenants/me",
  DOMAIN_SUGGESTION: "/tenants/domain-suggestion",
  JOIN_REQUESTS: "/tenants/join-requests",
};

const PAYROLL = {
  PAYROLL_RUNS: (page: number, limit: number, params = "") =>
    `/payroll/runs?page=${page}&limit=${limit}${params}`,
  INITIATE_PAYROLL_RUN: "/payroll/runs",
  UPDATE_PAYROLL_RUN_STATUS: "/payroll/runs/status",
  GET_PAYROLL_RUN: (runId: string) => `/payroll/runs/${runId}`,
  RETRY_PAYROLL_PAYOUTS: (runId: string) =>
    `/payroll/runs/${runId}/retry-payouts`,
  SALARY_ADVANCES: (page: number, limit: number, params = "") =>
    `/payroll/advances?page=${page}&limit=${limit}${params}`,
  REQUEST_SALARY_ADVANCE: "/payroll/advances",
  UPDATE_SALARY_ADVANCE_STATUS: "/payroll/advances/status",
  MY_PAYSLIPS: (page: number, limit: number) =>
    `/payroll/my-payslips?page=${page}&limit=${limit}`,
};

const PERFORMANCE_REVIEW = {
  REVIEW_CYCLES: (page: number, limit: number, params = "") =>
    `/performance-reviews/cycles?page=${page}&limit=${limit}${params}`,
  CREATE_REVIEW_CYCLE: "/performance-reviews/cycles",
  REVIEW_CYCLE: (cycleId: string) => `/performance-reviews/cycles/${cycleId}`,
  REVIEW_CYCLE_STATUS: (cycleId: string) =>
    `/performance-reviews/cycles/${cycleId}/status`,
  MY_REVIEWS: (userId: string, params = "") =>
    `/performance-reviews?userId=${userId}${params}`,
  TEAM_REVIEWS: (reviewerId: string, params = "") =>
    `/performance-reviews?reviewerId=${reviewerId}${params}`,
  CYCLE_REVIEWS: (cycleId: string) => `/performance-reviews?cycleId=${cycleId}`,
  // Unscoped — only privileged (HR/admin/owner/superuser) callers may use
  // this; the gateway rejects a bare query from anyone else.
  ALL_REVIEWS: "/performance-reviews",
  REVIEW: (reviewId: string) => `/performance-reviews/${reviewId}`,
  SUBMIT_SELF_ASSESSMENT: (reviewId: string) =>
    `/performance-reviews/${reviewId}/self-assessment`,
  SUBMIT_MANAGER_REVIEW: (reviewId: string) =>
    `/performance-reviews/${reviewId}/manager-review`,
};

const ASSETS = {
  ASSETS: (page: number, limit: number, params = "") =>
    `/assets?page=${page}&limit=${limit}${params}`,
  CREATE_ASSET: "/assets",
  UPDATE_ASSET: (id: string) => `/assets/${id}`,
  ASSIGN_ASSET: "/assets/assign",
  RETURN_ASSET: "/assets/return",
  RETIRE_ASSET: (id: string) => `/assets/${id}/retire`,
  ASSET_SUMMARY: "/assets/summary",
  ASSET_ASSIGNMENTS: (page: number, limit: number) =>
    `/assets/assignments?page=${page}&limit=${limit}`,
  ACKNOWLEDGE_ASSIGNMENT: (assignmentId: string) =>
    `/assets/assignments/${assignmentId}/acknowledge`,
  ASSET_ISSUES: (page: number, limit: number, params = "") =>
    `/assets/issues?page=${page}&limit=${limit}${params}`,
  REPORT_ASSET_ISSUE: "/assets/issues",
  UPDATE_ASSET_ISSUE_STATUS: (issueId: string) =>
    `/assets/issues/${issueId}/status`,
  LIST_ASSET_CATEGORIES: "/assets/categories",
  CREATE_ASSET_CATEGORY: "/assets/categories",
};

const WFH = {
  WFH_REQUESTS: (page: number, limit: number, params = "") =>
    `/wfh/requests?page=${page}&limit=${limit}${params}`,
  REQUEST_WFH: "/wfh/requests",
  UPDATE_WFH_STATUS: "/wfh/requests/status",
  BULK_UPDATE_WFH_STATUS: "/wfh/requests/bulk-status",
  WFH_CALENDAR: (year: number, month: number) =>
    `/wfh/calendar?year=${year}&month=${month}`,
};

const HELPDESK = {
  TICKETS: (page: number, limit: number, params = "") =>
    `/helpdesk/tickets?page=${page}&limit=${limit}${params}`,
  TICKET: (id: string) => `/helpdesk/tickets/${id}`,
  CREATE_TICKET: "/helpdesk/tickets",
  UPDATE_TICKET: (id: string) => `/helpdesk/tickets/${id}`,
  ADD_TICKET_COMMENT: (id: string) => `/helpdesk/tickets/${id}/comments`,
  HELPDESK_STATS: "/helpdesk/stats",
};

const WEBHOOKS = {
  WEBHOOK_ENDPOINTS: "/webhooks/endpoints",
  CREATE_WEBHOOK_ENDPOINT: "/webhooks/endpoints",
  UPDATE_WEBHOOK_ENDPOINT: (id: string) => `/webhooks/endpoints/${id}`,
  DELETE_WEBHOOK_ENDPOINT: (id: string) => `/webhooks/endpoints/${id}`,
  WEBHOOK_DELIVERIES: (endpointId: string, page: number, limit: number) =>
    `/webhooks/endpoints/${endpointId}/deliveries?page=${page}&limit=${limit}`,
  RETRY_WEBHOOK_DELIVERY: (deliveryId: string) =>
    `/webhooks/deliveries/${deliveryId}/retry`,
  TEST_WEBHOOK_ENDPOINT: "/webhooks/test",
};

const APPROVALS = {
  GET_PENDING_APPROVALS: "/approvals/pending",
  GET_ALL_PENDING_APPROVALS: "/approvals/pending-all",
  ACT_ON_APPROVAL: (instanceId: string) => `/approvals/${instanceId}/act`,
  GET_PENDING_KYC_APPROVALS: "/kyc-approvals/pending",
  GET_PENDING_JOIN_REQUESTS: "/tenants/join-requests/pending",
};

const REPORTS = {
  RUN_REPORT: "/reports/run",
  SAVED_REPORTS: (page: number, limit: number) =>
    `/reports/saved?page=${page}&limit=${limit}`,
  SAVE_REPORT: "/reports/saved",
  GET_SAVED_REPORT: (id: string) => `/reports/saved/${id}`,
  RUN_SAVED_REPORT: (id: string) => `/reports/saved/${id}/run`,
  DELETE_SAVED_REPORT: (id: string) => `/reports/saved/${id}`,
  ENTITY_SCHEMA: (entity: string) => `/reports/schema/${entity}`,
};

export const API_ENDPOINTS = {
  ...NOTIFICATIONS,
  ...CHAT,
  ...PERMISSIONS,
  ...CALENDAR,
  ...ATTENDANCE,
  ...LEAVE,
  ...KYC,
  ...EMPLOYEE,
  ...HOLIDAYS,
  ...HR_ACTIVITIES,
  ...JOB_OPENINGS,
  ...RESIGNATION,
  ...SALARY_MANAGEMENT,
  ...USER,
  ...POLICY,
  ...UPLOAD,
  ...CHATBOT,
  ...AI_INSIGHTS,
  ...DEVELOPER,
  ...ORG_SETTINGS,
  ...EXIT_POLICY,
  ...RECRUITMENT_PIPELINE,
  ...PAYROLL_COMPONENTS,
  ...ONBOARDING,
  ...BULK_ONBOARDING,
  ...PAYMENT,
  ...TENANT,
  ...PAYROLL,
  ...PERFORMANCE_REVIEW,
  ...ASSETS,
  ...WFH,
  ...HELPDESK,
  ...WEBHOOKS,
  ...REPORTS,
  ...APPROVALS,
  ...TAX_DECLARATION,
};
