// Single source of truth for the bulk "onboard existing employees" Excel
// import: both the template generator (buildOnboardingTemplate) and the
// upload validator (validateOnboardingWorkbook) read from ONBOARDING_TABS,
// so the template's columns can never drift out of sync with what the
// parser actually accepts. Only the Employees tab exists so far — later
// tabs (Leave Balances, Teams, Roles, Assets, Salary Advances,
// Resignations) are additional entries in ONBOARDING_TABS, each with their
// own columns and an "Employee Email" cross-reference back to this tab.

export type ColumnType = "string" | "email" | "date" | "number" | "enum";

export interface ImportColumn {
  header: string;
  key: string;
  required: boolean;
  type: ColumnType;
  enumValues?: readonly string[];
}

export interface ImportTabSpec {
  sheetName: string;
  description: string;
  columns: readonly ImportColumn[];
}

export const ATTENDANCE_MODES = ["office", "field", "remote"] as const;

export const EMPLOYEES_COLUMNS: readonly ImportColumn[] = [
  {
    header: "Official Email *",
    key: "officialEmail",
    required: true,
    type: "email",
  },
  { header: "First Name *", key: "firstName", required: true, type: "string" },
  { header: "Middle Name", key: "middleName", required: false, type: "string" },
  { header: "Last Name *", key: "lastName", required: true, type: "string" },
  { header: "Mobile", key: "mobile", required: false, type: "string" },
  {
    header: "Date of Birth (DD/MM/YYYY)",
    key: "dob",
    required: false,
    type: "date",
  },
  { header: "Blood Group", key: "bloodGroup", required: false, type: "string" },
  {
    header: "Qualification",
    key: "qualification",
    required: false,
    type: "string",
  },
  { header: "Department", key: "department", required: false, type: "string" },
  {
    header: "Designation",
    key: "designation",
    required: false,
    type: "string",
  },
  {
    header: "Joining Date * (DD/MM/YYYY)",
    key: "joiningDate",
    required: true,
    type: "date",
  },
  {
    header: "Attendance Mode",
    key: "attendanceMode",
    required: false,
    type: "enum",
    enumValues: ATTENDANCE_MODES,
  },
  {
    header: "Reference By",
    key: "referenceBy",
    required: false,
    type: "string",
  },

  // Compensation — one SalaryStructure row is seeded per employee, reusing
  // the same deriveOfferCompensationBreakup formula seedSalaryFromHire uses
  // (salary.ts) when only the annual figure is given. Fill in Basic Pay
  // (and optionally the rest) instead if you have an exact breakdown.
  {
    header: "Annual CTC / Gross Salary *",
    key: "grossSalary",
    required: true,
    type: "number",
  },
  { header: "Basic Pay", key: "basicPay", required: false, type: "number" },
  { header: "HRA", key: "hra", required: false, type: "number" },
  { header: "Conveyance", key: "conveyance", required: false, type: "number" },
  { header: "Incentive", key: "incentive", required: false, type: "number" },
  { header: "PF", key: "pf", required: false, type: "number" },
  { header: "ESI", key: "esi", required: false, type: "number" },
  { header: "PT", key: "pt", required: false, type: "number" },

  // Address (optional — HR can leave blank and let the employee fill this
  // in themselves via the existing KYC self-serve flow).
  {
    header: "Permanent Address Line 1",
    key: "permanentAddressLine1",
    required: false,
    type: "string",
  },
  {
    header: "Permanent Address Line 2",
    key: "permanentAddressLine2",
    required: false,
    type: "string",
  },
  {
    header: "Permanent Address City",
    key: "permanentAddressCity",
    required: false,
    type: "string",
  },
  {
    header: "Permanent Address State",
    key: "permanentAddressState",
    required: false,
    type: "string",
  },
  {
    header: "Permanent Address Pincode",
    key: "permanentAddressPincode",
    required: false,
    type: "string",
  },

  // Statutory / KYC (optional for the same reason as address above).
  { header: "PAN No", key: "panNo", required: false, type: "string" },
  { header: "Aadhar No", key: "aadharNo", required: false, type: "string" },
  { header: "PF No", key: "pfNo", required: false, type: "string" },
  { header: "UAN No", key: "uanNo", required: false, type: "string" },
  { header: "ESIC No", key: "esicNo", required: false, type: "string" },

  // Bank (optional, same reasoning).
  { header: "Bank Name", key: "bankName", required: false, type: "string" },
  {
    header: "Bank Account No",
    key: "bankAccountNo",
    required: false,
    type: "string",
  },
  { header: "IFSC Code", key: "ifscCode", required: false, type: "string" },
] as const;

export const EMPLOYEES_TAB: ImportTabSpec = {
  sheetName: "Employees",
  description:
    'One row per existing employee. "Official Email" must be the exact ' +
    "Google account they will sign in with — it becomes their login " +
    "identity, and a mismatch here means their first login creates a " +
    "duplicate account instead of activating this one.",
  columns: EMPLOYEES_COLUMNS,
};

export const ONBOARDING_TABS: readonly ImportTabSpec[] = [EMPLOYEES_TAB];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Never JS's native `new Date(string)` for user-typed dates — for a
// slash-separated string it assumes the US MM/DD/YYYY convention, so
// "20/10/1972" (20th October, the format this template documents and this
// user base actually types) fails outright since 20 isn't a valid month.
// Accepts ISO (unambiguous) or DD/MM/YYYY, with a 2-digit-year pivot.
const ISO_DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY_DATE_RE = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2}|\d{4})$/;

function parseFlexibleDate(str: string): Date | null {
  let year: number;
  let month: number;
  let day: number;

  const iso = ISO_DATE_RE.exec(str);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const dmy = DMY_DATE_RE.exec(str);
    if (!dmy) return null;
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
    // Two-digit year — pivot the same way most spreadsheet apps do:
    // 00-49 -> 2000s, 50-99 -> 1900s.
    if (year < 100) year += year < 50 ? 2000 : 1900;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject overflowed dates JS would otherwise silently roll forward
  // (e.g. 31/02/2026 quietly becoming March 3rd).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export interface RowValidationResult {
  errors: string[];
  values: Record<string, unknown>;
}

// Per-column type/required checks for a single row. Cross-row concerns
// (duplicate emails within the sheet, emails already in use in the DB,
// cross-tab reference resolution once more tabs exist) are the caller's
// responsibility — this only knows about one row in isolation.
export function validateRow(
  columns: readonly ImportColumn[],
  raw: Record<string, unknown>,
): RowValidationResult {
  const errors: string[] = [];
  const values: Record<string, unknown> = {};

  for (const col of columns) {
    const cell = raw[col.key];
    const isBlank =
      cell === null || cell === undefined || String(cell).trim() === "";

    if (isBlank) {
      if (col.required) errors.push(`"${col.header}" is required`);
      values[col.key] = null;
      continue;
    }

    const str = String(cell).trim();
    switch (col.type) {
      case "string":
        values[col.key] = str;
        break;
      case "email":
        if (!EMAIL_RE.test(str)) {
          // Quote the exact parsed value, not just the header — this is
          // usually a copy/paste artifact (stray whitespace, a label like
          // "Email: x@y.com", multiple addresses in one cell) that isn't
          // visible just by looking at the cell in Excel.
          errors.push(`"${col.header}" is not a valid email address: "${str}"`);
        }
        values[col.key] = str.toLowerCase();
        break;
      case "number": {
        const n = Number(str);
        if (Number.isNaN(n)) {
          errors.push(`"${col.header}" must be a number: "${str}"`);
        }
        values[col.key] = n;
        break;
      }
      case "date": {
        const d = parseFlexibleDate(str);
        if (!d) {
          errors.push(
            `"${col.header}" must be a valid date in DD/MM/YYYY format: "${str}"`,
          );
        }
        values[col.key] = d;
        break;
      }
      case "enum": {
        const normalized = str.toLowerCase();
        if (!col.enumValues?.includes(normalized)) {
          errors.push(
            `"${col.header}" must be one of: ${col.enumValues?.join(", ")} (got "${str}")`,
          );
        }
        values[col.key] = normalized;
        break;
      }
    }
  }

  return { errors, values };
}
