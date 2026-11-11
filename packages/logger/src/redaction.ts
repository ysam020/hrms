// Shared rules for keeping personal and secret values out of persisted
// diagnostics: the audit trail (packages/database/src/auditMiddleware.ts)
// and log lines (the redactSensitiveFormat below, applied to every logger
// transport). One classifier, so a field the audit trail hides can't still
// leak through an error log, and vice versa.
//
// Keys are compared in a normalized form (lower-case, separators removed),
// so `aadharNo`, `aadhar_no`, `AadhaarNumber` and `aadhaar-no` all match the
// same rule — the schema already mixes camelCase (JobApplication) and
// snake_case (User KYC) for the same kind of data.

export type FieldClass = "secret" | "omit";

/** `aadharNo` → `aadharno`, `Aadhaar_Number` → `aadhaarnumber`. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Credentials and government/bank identifiers: replaced outright, at any
// depth, and never hashed (a 12-digit Aadhaar hash is brute-forceable).
const SECRET_EXACT = new Set(
  [
    "password",
    "refreshToken",
    "webAuthnCredentials",
    "fcmTokens",
    "face_descriptor",
    "electricity_bill",
    "education_certificates",
    "experience_certificate",
    "signingSecret",
    "webhookSecret",
    "otp",
    "otpHash",
  ].map(normalizeKey),
);

const SECRET_PATTERNS: RegExp[] = [
  // Credential-shaped names the exact list can't anticipate (tokenHashes,
  // recoveryCodeHash, …) — a new secret field is hidden by default.
  /(password|passcode|secret|token|hash|otp|credential|apikey|privatekey|recoverycode)/,
  // Aadhaar in every spelling the codebase and its forms use: aadhar_no,
  // aadharNo, aadhaarNumber, aadhar_photo_front, uidai…
  /^(aadha{1,2}r|adhaar|aadhar|uid(ai)?(no|number)?$)/,
  /^pan(no|number|card|photo)?$/,
  /^(bankaccount|accountnumber|accountno|ifsc)/,
  /^passport/,
];

// Bulky or unnecessary applicant content: dropped from snapshots and logs
// (replaced by a size marker) rather than masked — nobody reviewing an
// audit trail needs a resume body, and inline legacy resumes are 100 KB+
// base64 PDFs.
const OMIT_EXACT = new Set(
  ["resume", "resumeText", "parsedResume", "coverLetter", "answers"].map(
    normalizeKey,
  ),
);

// Field names that are only sensitive on specific models — `data` is far
// too generic to drop everywhere, but on ApplicationDraft it is the whole
// applicant form.
const OMIT_BY_MODEL: Record<string, Set<string>> = {
  ApplicationDraft: new Set(["data"]),
};

/** Strings longer than this are never stored verbatim in snapshots. */
export const MAX_SNAPSHOT_STRING_BYTES = 2048;

export function classifyField(key: string, model?: string): FieldClass | null {
  const k = normalizeKey(key);
  if (SECRET_EXACT.has(k) || SECRET_PATTERNS.some((p) => p.test(k))) {
    return "secret";
  }
  if (OMIT_EXACT.has(k) || (model && OMIT_BY_MODEL[model]?.has(key))) {
    return "omit";
  }
  return null;
}

export const REDACTED = "[REDACTED]";

function byteLength(value: unknown): number {
  try {
    return Buffer.byteLength(
      typeof value === "string" ? value : (JSON.stringify(value) ?? ""),
    );
  } catch {
    return 0;
  }
}

export function omittedMarker(value: unknown): string {
  return `[OMITTED: ${byteLength(value)} bytes]`;
}

/**
 * Recursively replaces secret fields with "[REDACTED]", omitted fields and
 * oversized strings with a size marker. `model` scopes the model-specific
 * omissions and only applies at the top level of that model's record.
 */
export function redactSensitive(value: unknown, model?: string): unknown {
  return walk(value, model, 0, new WeakSet());
}

function walk(
  value: unknown,
  model: string | undefined,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (
      value.startsWith("data:") ||
      byteLength(value) > MAX_SNAPSHOT_STRING_BYTES
    ) {
      return omittedMarker(value);
    }
    return value;
  }
  if (typeof value !== "object" || value instanceof Date) return value;
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, undefined, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const cls = classifyField(key, depth === 0 ? model : undefined);
    if (cls === "secret")
      out[key] = v === null || v === undefined ? v : REDACTED;
    else if (cls === "omit")
      out[key] = v === null || v === undefined ? v : omittedMarker(v);
    else out[key] = walk(v, undefined, depth + 1, seen);
  }
  return out;
}

// Personal fields that are encrypted in the database (see
// packages/database/src/piiRegistry.ts). The audit trail keeps showing them
// to people allowed to read it, so they are hidden from log lines only.
const LOG_ONLY_EXACT = new Set(
  [
    "first_name",
    "middle_name",
    "last_name",
    "firstName",
    "lastName",
    "fullName",
    "username",
    "userEmail",
    "email",
    "official_email",
    "officialEmail",
    "personalEmail",
    "assignedOfficialEmail",
    "recipients",
    "to",
    "mobile",
    "phone",
    "dob",
    "dateOfBirth",
    "blood_group",
    "bloodGroup",
    "uan_no",
    "pf_no",
    "esic_no",
    "uanNo",
    "pfNo",
    "esicNo",
    "bank_name",
    "employee_photo",
    "medicalCertificate",
    "wfhHomeLatitude",
    "wfhHomeLongitude",
    "wfhHomeName",
    "latitude",
    "longitude",
    "ip",
    "ipAddress",
    "userAgent",
    "deviceFingerprint",
    "grossSalary",
    "netPayable",
    "basicPay",
    "hra",
    "conveyance",
    "incentive",
    "grossEarnings",
    "totalDeductions",
    "hireSalary",
    "offeredCTC",
    "amount",
    "emiAmount",
    "remainingAmount",
    "componentBreakdown",
    "lineItems",
    "html",
    "subject",
    "profile",
    "screeningAnswers",
    "scorecards",
    "answers",
    "content",
    "comment",
    "body",
    "selfComments",
    "managerComments",
  ].map(normalizeKey),
);
// Not `name`: error objects carry their class in it.
const LOG_ONLY_PATTERNS: RegExp[] = [/address/, /salary/, /^candidatename$/];

export function isLogOnlyPii(key: string): boolean {
  const k = normalizeKey(key);
  return LOG_ONLY_EXACT.has(k) || LOG_ONLY_PATTERNS.some((p) => p.test(k));
}

// Values that are sensitive by shape even when their key is not — e.g. a
// Prisma validation error echoes the whole `data: { aadharNo: "…" }`
// argument inside its message text, where key-based rules can't see it.
const AADHAAR_LIKE = /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;
const EMAIL_LIKE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PAN_LIKE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
const PHONE_LIKE = /(?:\+91[ -]?)?\b[6-9]\d{4}[ -]?\d{5}\b/g;
const DATA_URL = /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{64,}/gi;

export function scrubText(text: string): string {
  return text
    .replace(DATA_URL, (m) => `[OMITTED data URL: ${m.length} chars]`)
    .replace(AADHAAR_LIKE, "[REDACTED-ID]")
    .replace(EMAIL_LIKE, "[REDACTED-EMAIL]")
    .replace(PAN_LIKE, "[REDACTED-ID]")
    .replace(PHONE_LIKE, "[REDACTED-PHONE]");
}

/**
 * Log-line variant of redactSensitive: same key rules, plus scrubText on
 * every string (error messages, stacks), but no size cut-off — stack traces
 * are legitimately long.
 */
export function redactForLog(value: unknown): unknown {
  return walkLog(value, new WeakSet());
}

function walkLog(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => walkLog(v, seen));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const cls = classifyField(key);
    if (
      cls === "secret" ||
      (v !== null && v !== undefined && isLogOnlyPii(key))
    )
      out[key] = v === null || v === undefined ? v : REDACTED;
    else if (cls === "omit")
      out[key] = v === null || v === undefined ? v : omittedMarker(v);
    else out[key] = walkLog(v, seen);
  }
  return out;
}
