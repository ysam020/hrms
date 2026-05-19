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
  GET_EMPLOYEE_ATTENDANCE: (month: number, year: number) =>
    `/get-attendances/${month}/${year}`,
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
  VIEW_ALL_KYCS: (page: number, limit: number) =>
    `/view-all-kycs?page=${page}&limit=${limit}`,
};

const EMPLOYEE = {
  EMPLOYEE_INSIGHTS: "/employee-insights",
  EDIT_EMPLOYEE_DETAILS: `/edit-employee-details`,
  GET_ALL_USERS: (limit = 500) => `/get-all-users?limit=${limit}`,
};

const HOLIDAYS = {
  ADD_HOLIDAY: "/add-holiday",
  DELETE_HOLIDAY: "/delete-holiday",
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
};

const JOB_OPENINGS = {
  ADD_JOB_OPENING: "/add-job-opening",
  EDIT_JOB_OPENING: (id: string | number) => `/edit-job-opening/${id}`,
  VIEW_JOB_OPENINGS: "/view-job-openings",
  DELETE_JOB_OPENING: (id: string | number) => `/delete-job-opening/${id}`,
  GET_ALL_JOB_OPENINGS: `/public/careers`,
  GET_JOB_TITLES: "/get-job-titles",
  APPLY_FOR_JOB: "/apply-for-job",
  HIRE_CANDIDATE: "/hire-candidate",
  REJECT_CANDIDATE: "/reject-application",
  UPDATE_CANDIDATE_STATUS: "/update-candidate-status",
  SCHEDULE_INTERVIEW: "/schedule-interview",
  RESCHEDULE_INTERVIEW: "/reschedule-interview",
  REASSIGN_INTERVIEWER: "/reassign-interviewer",
  JOB_OPENINGS_INSIGHTS: "/job-openings-insights",
};

const RESIGNATION = {
  ADD_EXIT_FEEDBACK: "/add-exit-feedback",
  RESIGNATION_INSIGHTS: "/resignation-insights",
  ADD_RESIGNATION: "/add-resignation",
  VIEW_RESIGNATIONS: (page: number, limit: number) =>
    `/view-resignations?page=${page}&limit=${limit}`,
  UPDATE_RESIGNATION: (id: string | number) => `/update-resignation/${id}`,
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
  OG_PREVIEW: (url: string) => `/og-preview?url=${encodeURIComponent(url)}`,
};

const RULES = {
  GET_RULES: "/rules",
  DELETE_RULE: (id: string | number) => `/rules/${id}`,
  TOGGLE_RULE_STATUS: (id: string | number) => `/rules/${id}/status`,
  TEST_RULE: "/rules/test",
  UPDATE_RULE: (id: string | number) => `/rules/${id}`,
  ADD_RULE: "/rules",
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
  ...RULES,
  ...POLICY,
  ...UPLOAD,
  ...CHATBOT,
  ...AI_INSIGHTS,
  ...DEVELOPER,
};
