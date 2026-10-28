// Values match the `entityType` actually written by the backend: either the
// literal Prisma model name (from the audit-logging Prisma middleware, see
// packages/database/src/auditMiddleware.ts) or "auth" for the handful of
// security events logged separately (see apps/api-gateway/src/middleware/auditLog.ts).
export const entityOptions = [
  { label: "All", value: "" },
  { label: "Account security", value: "auth" },
  { label: "Employee records", value: "User" },
  { label: "Attendance", value: "AttendanceRecord" },
  { label: "Leave", value: "LeaveApplication" },
  { label: "WFH", value: "WfhRequest" },
  { label: "Job Openings", value: "JobOpening" },
  { label: "Job Applications", value: "JobApplication" },
  { label: "Resignation", value: "Resignation" },
  { label: "Payroll Runs", value: "PayrollRun" },
  { label: "Salary Structure", value: "SalaryStructure" },
  { label: "Salary Advance", value: "SalaryAdvance" },
  { label: "Assets", value: "Asset" },
  { label: "Helpdesk", value: "Ticket" },
  { label: "HR Activities", value: "HrActivity" },
  { label: "Policies", value: "Policy" },
  { label: "Roles & Permissions", value: "Role" },
  { label: "Tenant Settings", value: "TenantSettings" },
  { label: "Holidays", value: "Holiday" },
];
