/**
 * Permission Bitmask Registry — Client
 *
 * Mirrors the server registry with one key difference: scope hierarchy is NOT
 * encoded here. Each module:action:scope tuple gets its own independent bit.
 *
 * This preserves the client's existing exact-match semantics:
 *   - Checkboxes in the permissions editor show only explicitly granted scopes
 *   - "Leave:view:all" does NOT automatically check the "self" or "team" boxes
 *
 * The bitmask gives O(1) lookup after a one-time O(n) conversion from the
 * permissions string array, compared to O(n) per call with Array.includes().
 */

// Registry

const PERM_DEFS = [
  // Attendance
  ["Attendance", "mark_attendance", "self"],
  ["Attendance", "view", "self", "team", "all"],
  ["Attendance", "attendance_correction", "all"],

  // Leave
  ["Leave", "apply", "self"],
  ["Leave", "view", "self", "team", "all"],
  ["Leave", "approve_reject", "team", "all"],
  ["Leave", "approve", "team", "all"],
  ["Leave", "reject", "team", "all"],

  // Analytics (scopeless)
  ["Analytics", "view_employee_analytics"],
  ["Analytics", "view_demographic_analytics"],
  ["Analytics", "view_hiring_analytics"],
  ["Analytics", "view_leave_analytics"],
  ["Analytics", "view_attendance_analytics"],
  ["Analytics", "view_recruitment_analytics"],
  ["Analytics", "view_salary_analytics"],

  // BasicKYCDetails
  ["BasicKYCDetails", "fill_kyc_form", "self"],
  ["BasicKYCDetails", "view_kyc", "self", "all"],
  ["BasicKYCDetails", "edit_kyc", "all"],
  ["BasicKYCDetails", "approve_kyc", "all"],
  ["BasicKYCDetails", "request_kyc_revision", "all"],

  // JobOpenings (scopeless)
  ["JobOpenings", "view_job_openings"],
  ["JobOpenings", "create_job_opening"],
  ["JobOpenings", "edit_job_opening"],
  ["JobOpenings", "delete_job_opening"],
  ["JobOpenings", "view_applications"],
  ["JobOpenings", "update_candidate_status"],
  ["JobOpenings", "schedule_interview"],
  ["JobOpenings", "take_interview"],
  ["JobOpenings", "provide_feedback"],
  ["JobOpenings", "hire_candidate"],
  ["JobOpenings", "reject_candidate"],
  ["JobOpenings", "reassign_interviewer"],

  // HRActivities
  ["HRActivities", "view", "all"],
  ["HRActivities", "read", "all"],
  ["HRActivities", "create"],
  ["HRActivities", "edit"],
  ["HRActivities", "delete"],

  // Resignation
  ["Resignation", "create", "self"],
  ["Resignation", "view", "self", "team", "all"],
  ["Resignation", "approve", "team", "all"],
  ["Resignation", "edit", "team", "all"],

  // ResignationProcess
  ["ResignationProcess", "resign", "self"],
  ["ResignationProcess", "withdraw_resignation", "self"],
  ["ResignationProcess", "add_exit_feedback", "self"],
  ["ResignationProcess", "view_resignation", "self", "team", "all"],
  ["ResignationProcess", "approve_resignation", "team", "all"],
  ["ResignationProcess", "reject_resignation", "team", "all"],
  ["ResignationProcess", "update_resignation_status", "team", "all"],

  // Permissions (mostly scopeless)
  ["Permissions", "create_role"],
  ["Permissions", "view_roles"],
  ["Permissions", "view_role_permissions"],
  ["Permissions", "view_role_and_permissions"],
  ["Permissions", "manage_role_permissions"],
  ["Permissions", "delete_role"],
  ["Permissions", "assign_user_permissions"],
  ["Permissions", "view_user_permissions"],
  ["Permissions", "delete_user_role"],
  ["Permissions", "remove_user_role"],
  ["Permissions", "create_team"],
  ["Permissions", "view_teams"],
  ["Permissions", "add_team_member"],
  ["Permissions", "delete_team_member"],
  ["Permissions", "delete_team"],
  ["Permissions", "assign_superuser"],
  ["Permissions", "revoke_superuser"],
  ["Permissions", "grant_superuser", "all"],

  // AuditLogs
  ["AuditLogs", "view", "self", "team", "all"],

  // Holidays (scopeless)
  ["Holidays", "add"],
  ["Holidays", "delete"],

  // SalaryManagement (scopeless)
  ["SalaryManagement", "update_salary"],
  ["SalaryManagement", "view_salaries"],
  ["SalaryManagement", "view_salary_slips"],
  ["SalaryManagement", "approve_advance"],

  // EmployeeManagement (scopeless)
  ["EmployeeManagement", "view"],
  ["EmployeeManagement", "edit"],

  // Policy (scopeless)
  ["Policy", "create"],
  ["Policy", "update"],
  ["Policy", "delete"],

  // Organisation (scopeless)
  ["Organisation", "edit_company_info"],
  ["Organisation", "edit_organisation_settings"],
  ["Organisation", "approve_join_requests"],

  // Assets (scopeless)
  ["Assets", "manage"],

  // WFH (scopeless)
  ["WFH", "approve"],

  // Helpdesk (scopeless)
  ["Helpdesk", "manage"],

  // TaxDeclaration
  ["TaxDeclaration", "fill_declaration", "self"],
  ["TaxDeclaration", "view_declaration", "self", "all"],
  ["TaxDeclaration", "review_declaration", "all"],
  ["TaxDeclaration", "review_proofs", "all"],
];

// PERM_META["Module:action"] = { scopelessBit?, scopeBits?: { scope: BigInt } }
const PERM_META: Record<
  string,
  { scopelessBit?: bigint; scopeBits?: Record<string, bigint> }
> = {};
let _bitPos = 0n;

for (const [module, action, ...scopes] of PERM_DEFS) {
  const key = `${module}:${action}`;
  if (!PERM_META[key]) PERM_META[key] = {};

  if (scopes.length === 0) {
    PERM_META[key].scopelessBit = 1n << _bitPos++;
  } else {
    if (!PERM_META[key].scopeBits) PERM_META[key].scopeBits = {};
    for (const scope of scopes) {
      PERM_META[key].scopeBits[scope] = 1n << _bitPos++;
    }
  }
}

export const SUPERUSER_MASK = (1n << _bitPos) - 1n;

// Encoding

/**
 * Convert a permissions string array to a BigInt bitmask.
 * NO scope hierarchy expansion — each permission string maps to exactly one bit.
 *
 * @param {string[]} permissions
 * @returns {BigInt}
 */
export function fromPermissionsArray(permissions) {
  if (!permissions?.length) return 0n;

  let mask = 0n;

  for (const perm of permissions) {
    const c1 = perm.indexOf(":");
    if (c1 === -1) continue;

    const c2 = perm.indexOf(":", c1 + 1);
    const key = c2 === -1 ? perm : perm.slice(0, c2);
    const scope = c2 === -1 ? null : perm.slice(c2 + 1);

    const meta = PERM_META[key];
    if (!meta) continue;

    if (meta.scopelessBit !== undefined) {
      mask |= meta.scopelessBit;
    } else if (scope && meta.scopeBits?.[scope] !== undefined) {
      mask |= meta.scopeBits[scope];
    }
  }

  return mask;
}

// Check

/**
 * Exact-match check: does this bitmask contain the specific module:action:scope?
 *
 * For scopeless permissions (scope === "-"), only the action bit is checked.
 *
 * @param {BigInt} mask
 * @param {string} module
 * @param {string} action
 * @param {string} scope - use "-" for scopeless permissions
 * @returns {boolean}
 */
export function hasPermissionFromMask(mask, module, action, scope) {
  const meta = PERM_META[`${module}:${action}`];
  if (!meta) return false;

  if (scope === "-" || !scope) {
    return meta.scopelessBit !== undefined && (mask & meta.scopelessBit) !== 0n;
  }

  const bit = meta.scopeBits?.[scope];
  return bit !== undefined && (mask & bit) !== 0n;
}
