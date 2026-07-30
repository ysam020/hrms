// Server-owned catalog of valid permission strings — mirrors the shape of
// apps/web/src/assets/data/permissionStructure.tsx (module -> action ->
// allowed scopes). Kept as a separate copy rather than a shared import
// because the frontend file is a display/UI-ordering concern (module
// labels, tab order) while this one exists purely to reject permission
// strings that were never offered by the UI in the first place. Add a
// module/action here whenever permissionStructure.tsx gains one.
const PERMISSION_STRUCTURE: Record<string, Record<string, string[]>> = {
  HRActivities: {
    view: ["all"],
    create: ["-"],
    edit: ["-"],
    delete: ["-"],
  },
  Attendance: {
    view: ["self", "team", "all"],
    mark_attendance: ["self"],
    attendance_correction: ["all"],
  },
  Leave: {
    view: ["self", "team", "all"],
    apply: ["self"],
    approve: ["team", "all"],
    reject: ["team", "all"],
  },
  EmployeeManagement: {
    view: ["-"],
    edit: ["-"],
  },
  BasicKYCDetails: {
    fill_kyc_form: ["self"],
    view_kyc: ["self", "all"],
    edit_kyc: ["all"],
    approve_kyc: ["all"],
    request_kyc_revision: ["all"],
  },
  TaxDeclaration: {
    fill_declaration: ["self"],
    view_declaration: ["self", "all"],
    review_declaration: ["all"],
    review_proofs: ["all"],
  },
  JobOpenings: {
    view_job_openings: ["-"],
    create_job_opening: ["-"],
    view_applications: ["-"],
    edit_job_opening: ["-"],
    delete_job_opening: ["-"],
    schedule_interview: ["-"],
    take_interview: ["-"],
    provide_feedback: ["-"],
    reassign_interviewer: ["-"],
    update_candidate_status: ["-"],
    hire_candidate: ["-"],
    reject_candidate: ["-"],
  },
  ResignationProcess: {
    resign: ["self"],
    withdraw_resignation: ["self"],
    add_exit_feedback: ["self"],
    view_resignation: ["self", "team", "all"],
    approve_resignation: ["team", "all"],
    reject_resignation: ["team", "all"],
    update_resignation_status: ["team", "all"],
  },
  Permissions: {
    create_role: ["-"],
    view_role_permissions: ["-"],
    view_role_and_permissions: ["-"],
    view_user_permissions: ["-"],
    manage_role_permissions: ["-"],
    delete_role: ["-"],
    assign_user_permissions: ["-"],
    remove_user_role: ["-"],
    create_team: ["-"],
    view_teams: ["-"],
    add_team_member: ["-"],
    delete_team_member: ["-"],
    delete_team: ["-"],
    assign_superuser: ["-"],
    revoke_superuser: ["-"],
  },
  Holidays: {
    add: ["-"],
    delete: ["-"],
  },
  SalaryManagement: {
    update_salary: ["-"],
    view_salaries: ["-"],
    view_salary_slips: ["-"],
    approve_advance: ["-"],
  },
  Policy: {
    create: ["-"],
    update: ["-"],
    delete: ["-"],
  },
  Subscription: {
    manage: ["-"],
  },
  Organisation: {
    edit_company_info: ["-"],
    edit_organisation_settings: ["-"],
    approve_join_requests: ["-"],
  },
  Assets: {
    manage: ["-"],
  },
  WFH: {
    approve: ["-"],
  },
  Helpdesk: {
    manage: ["-"],
  },
  PerformanceReview: {
    manage_cycles: ["-"],
  },
};

const SUPERUSER_WILDCARD = "*:*:*";

const VALID_PERMISSIONS: Set<string> = new Set([SUPERUSER_WILDCARD]);
for (const [module, actions] of Object.entries(PERMISSION_STRUCTURE)) {
  for (const [action, scopes] of Object.entries(actions)) {
    for (const scope of scopes) {
      VALID_PERMISSIONS.add(
        scope === "-" ? `${module}:${action}` : `${module}:${action}:${scope}`,
      );
    }
  }
}

export function isValidPermission(permission: unknown): permission is string {
  return typeof permission === "string" && VALID_PERMISSIONS.has(permission);
}

/** Splits `permissions` into [valid, invalid] against the server-owned catalog. */
export function partitionPermissions(permissions: unknown[]): {
  valid: string[];
  invalid: unknown[];
} {
  const valid: string[] = [];
  const invalid: unknown[] = [];
  for (const p of permissions) {
    if (isValidPermission(p)) valid.push(p);
    else invalid.push(p);
  }
  return { valid, invalid };
}
