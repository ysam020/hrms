import { randomUUID } from "crypto";

// Server-side rules for job openings' location/compensation/form settings and
// for what a candidate submits against them. The web editor and the public
// apply page mirror these for instant feedback, but only this file is trusted:
// the public client never supplies field definitions, required flags or
// allowed options — they're always read back from the stored opening.

// ── Job opening configuration ───────────────────────────────────────────────

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temporary",
  "other",
] as const;
export const WORKPLACE_TYPES = ["onsite", "hybrid", "remote"] as const;
export const REMOTE_SCOPES = ["anywhere", "country", "regions"] as const;
export const VISIBILITIES = ["external", "internal", "both"] as const;

export type FieldMode = "hidden" | "optional" | "required";
const FIELD_MODES: FieldMode[] = ["hidden", "optional", "required"];

export type ProfileFieldType =
  | "text"
  | "url"
  | "years"
  | "lpa"
  | "days"
  | "yesno";

// Every optional application field an organisation can switch on. Name,
// email and mobile are always collected; the résumé and cover letter have
// their own modes on ApplicationFormConfig.
export const PROFILE_FIELDS: Record<
  string,
  { label: string; type: ProfileFieldType; default: FieldMode }
> = {
  currentLocation: {
    label: "Current location",
    type: "text",
    default: "required",
  },
  totalExperience: {
    label: "Total experience",
    type: "years",
    default: "required",
  },
  relevantExperience: {
    label: "Relevant experience",
    type: "years",
    default: "optional",
  },
  currentCompany: {
    label: "Current company",
    type: "text",
    default: "optional",
  },
  currentDesignation: {
    label: "Current designation",
    type: "text",
    default: "optional",
  },
  skills: { label: "Key skills", type: "text", default: "optional" },
  highestQualification: {
    label: "Highest qualification",
    type: "text",
    default: "optional",
  },
  noticePeriod: { label: "Notice period", type: "days", default: "optional" },
  expectedCtc: { label: "Expected CTC", type: "lpa", default: "optional" },
  currentCtc: { label: "Current CTC", type: "lpa", default: "hidden" },
  preferredLocation: {
    label: "Preferred work location",
    type: "text",
    default: "hidden",
  },
  willingToRelocate: {
    label: "Willing to relocate",
    type: "yesno",
    default: "hidden",
  },
  linkedinUrl: { label: "LinkedIn profile", type: "url", default: "optional" },
  portfolioUrl: { label: "Portfolio", type: "url", default: "hidden" },
  githubUrl: { label: "GitHub", type: "url", default: "hidden" },
};

export type ApplicationFormConfig = {
  fields: Record<string, FieldMode>;
  resume: Exclude<FieldMode, "hidden">;
  coverLetter: FieldMode;
};

export type ScreeningQuestionType =
  | "short_text"
  | "long_text"
  | "select"
  | "multi_select"
  | "yes_no"
  | "number"
  | "date";
const QUESTION_TYPES: ScreeningQuestionType[] = [
  "short_text",
  "long_text",
  "select",
  "multi_select",
  "yes_no",
  "number",
  "date",
];
const OPTION_TYPES = new Set<ScreeningQuestionType>(["select", "multi_select"]);

export type ScreeningQuestion = {
  id: string;
  label: string;
  type: ScreeningQuestionType;
  required: boolean;
  options: string[];
  helpText: string;
  order: number;
};

export type JobLocation = {
  country: string;
  state: string;
  city: string;
  office: string;
};

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Applies defaults for any field the stored config doesn't mention, so
 * openings created before configurable forms existed get the standard form. */
export function normalizeFormConfig(raw: unknown): ApplicationFormConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as any;
  const fields: Record<string, FieldMode> = {};
  for (const [key, def] of Object.entries(PROFILE_FIELDS)) {
    const mode = r.fields?.[key];
    fields[key] = FIELD_MODES.includes(mode) ? mode : def.default;
  }
  return {
    fields,
    resume: r.resume === "optional" ? "optional" : "required",
    coverLetter: FIELD_MODES.includes(r.coverLetter) ? r.coverLetter : "hidden",
  };
}

const MAX_QUESTIONS = 20;

/** Cleans recruiter-supplied questions. Existing ids are kept so answers
 * already given stay attached; new questions get a server-generated id. */
export function normalizeScreeningQuestions(raw: unknown): ScreeningQuestion[] {
  if (raw == null || raw === "") return [];
  if (!Array.isArray(raw))
    throw new ValidationError(
      "Screening questions must be a list.",
      "screeningQuestions",
    );
  if (raw.length > MAX_QUESTIONS)
    throw new ValidationError(
      `Add at most ${MAX_QUESTIONS} screening questions.`,
      "screeningQuestions",
    );
  const seen = new Set<string>();
  return raw.map((q: any, i: number) => {
    const label = str(q?.label, 300);
    if (!label)
      throw new ValidationError(
        `Question ${i + 1} needs a label.`,
        "screeningQuestions",
      );
    const type = QUESTION_TYPES.includes(q?.type) ? q.type : null;
    if (!type)
      throw new ValidationError(
        `Question ${i + 1} has an unknown type.`,
        "screeningQuestions",
      );
    let options: string[] = [];
    if (OPTION_TYPES.has(type)) {
      options = [
        ...new Set(
          (Array.isArray(q.options) ? q.options : [])
            .map((o: unknown) => str(o, 120))
            .filter(Boolean),
        ),
      ].slice(0, 30) as string[];
      if (options.length < 2)
        throw new ValidationError(
          `Question ${i + 1} needs at least two options.`,
          "screeningQuestions",
        );
    }
    let id = /^[A-Za-z0-9_-]{1,64}$/.test(q?.id ?? "") ? q.id : randomUUID();
    if (seen.has(id)) id = randomUUID();
    seen.add(id);
    return {
      id,
      label,
      type,
      required: q?.required === true,
      options,
      helpText: str(q?.helpText, 300),
      order: i,
    };
  });
}

const parseJson = (v: unknown) => {
  if (typeof v !== "string") return v;
  if (!v.trim()) return null;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
};

/** Reads the JSON columns of a proto JobOpening back into objects. */
export function readJobConfig(job: any) {
  const questions = parseJson(
    job?.screeningQuestionsJson ?? job?.screeningQuestions,
  );
  const locations = parseJson(job?.locationsJson ?? job?.locations);
  return {
    form: normalizeFormConfig(
      parseJson(job?.applicationFormJson ?? job?.applicationForm),
    ),
    questions: (Array.isArray(questions)
      ? questions
      : []) as ScreeningQuestion[],
    locations: (Array.isArray(locations) ? locations : []) as JobLocation[],
  };
}

const num = (v: unknown): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

const dayStart = (d: Date) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.getTime();
};

/**
 * Validates and normalises a job opening body from the editor. Returns the
 * extra fields for the gRPC CreateJobRequest. `existing` is the stored
 * opening on edit, so an unchanged past deadline doesn't block editing other
 * fields of an opening that has already closed.
 */
export function validateJobOpening(body: any, existing?: any) {
  const out: Record<string, any> = {};

  const employmentType = body.employmentType || "";
  if (employmentType && !EMPLOYMENT_TYPES.includes(employmentType))
    throw new ValidationError("Choose an employment type.", "employmentType");
  const workplaceType = body.workplaceType || "";
  if (workplaceType && !WORKPLACE_TYPES.includes(workplaceType))
    throw new ValidationError("Choose a workplace type.", "workplaceType");
  if (!existing && (!employmentType || !workplaceType))
    throw new ValidationError(
      employmentType
        ? "Choose a workplace type."
        : "Choose an employment type.",
      employmentType ? "workplaceType" : "employmentType",
    );
  out.employmentType = employmentType;
  out.workplaceType = workplaceType;

  if (body.visibility != null && body.visibility !== "") {
    if (!VISIBILITIES.includes(body.visibility))
      throw new ValidationError(
        "Choose who can see this opening.",
        "visibility",
      );
    out.visibility = body.visibility;
  }

  // Location: offices for on-site/hybrid, permitted regions for remote.
  const rawLocations = parseJson(body.locations);
  const locations: JobLocation[] = (
    Array.isArray(rawLocations) ? rawLocations : []
  )
    .slice(0, 10)
    .map((l: any) => ({
      country: str(l?.country, 80),
      state: str(l?.state, 80),
      city: str(l?.city, 80),
      office: str(l?.office, 200),
    }))
    .filter((l) => l.country || l.state || l.city || l.office);
  let remoteScope = "";
  let remoteRegions: string[] = [];
  if (workplaceType === "onsite" || workplaceType === "hybrid") {
    if (locations.length === 0)
      throw new ValidationError("Add the office location.", "locations");
    if (locations.some((l) => !l.city || !l.country))
      throw new ValidationError(
        "Each location needs a city and country.",
        "locations",
      );
  } else if (workplaceType === "remote") {
    remoteScope = REMOTE_SCOPES.includes(body.remoteScope)
      ? body.remoteScope
      : "anywhere";
    remoteRegions = (
      Array.isArray(body.remoteRegions) ? body.remoteRegions : []
    )
      .map((r: unknown) => str(r, 80))
      .filter(Boolean)
      .slice(0, 30);
    if (remoteScope === "country" && remoteRegions.length !== 1)
      throw new ValidationError(
        "Choose the country remote work is allowed from.",
        "remoteRegions",
      );
    if (remoteScope === "regions" && remoteRegions.length === 0)
      throw new ValidationError(
        "Add at least one country or region.",
        "remoteRegions",
      );
    if (remoteScope === "anywhere") remoteRegions = [];
  }
  // Remote openings may still name a home office, but never require one.
  out.locationsJson = JSON.stringify(locations);
  out.remoteScope = remoteScope;
  out.remoteRegions = remoteRegions;

  // Experience: `experience` stays the minimum, as it always was.
  const expMin = num(body.experience);
  const expMax = num(body.experienceMax);
  if (expMin === null || Number.isNaN(expMin) || expMin < 0 || expMin > 60)
    throw new ValidationError(
      "Enter the minimum years of experience.",
      "experience",
    );
  if (
    expMax !== null &&
    (Number.isNaN(expMax) || expMax < expMin || expMax > 60)
  )
    throw new ValidationError(
      "Maximum experience can't be less than the minimum.",
      "experienceMax",
    );
  out.experience = String(expMin);
  out.experienceMax = expMax === null ? "" : String(expMax);

  // Compensation is optional; when given, both ends are needed and ordered.
  const budget = Array.isArray(body.budget) ? body.budget.map(num) : [];
  const [bMin, bMax] = [budget[0] ?? null, budget[1] ?? null];
  if (bMin !== null || bMax !== null) {
    if (
      bMin === null ||
      bMax === null ||
      Number.isNaN(bMin) ||
      Number.isNaN(bMax) ||
      bMin < 0 ||
      bMax < 0
    )
      throw new ValidationError(
        "Enter both ends of the budget, in LPA.",
        "budgetMax",
      );
    if (bMin > bMax)
      throw new ValidationError(
        "Budget From can't be more than Budget To.",
        "budgetMax",
      );
    out.budget = [bMin, bMax];
  } else {
    out.budget = [];
  }
  out.budgetDisclosed =
    body.budgetDisclosed === true || body.budgetDisclosed === "true"
      ? "true"
      : "false";

  // Dates are calendar days. Apply By can't precede Posted On, and a new or
  // changed deadline can't already be over — that would publish a closed role.
  const posted = body.jobPostingDate ? new Date(body.jobPostingDate) : null;
  const deadline = body.applicationDeadline
    ? new Date(body.applicationDeadline)
    : null;
  if (!deadline || Number.isNaN(deadline.getTime()))
    throw new ValidationError(
      "Choose the Apply By date.",
      "applicationDeadline",
    );
  if (posted && Number.isNaN(posted.getTime()))
    throw new ValidationError(
      "Choose a valid Posted On date.",
      "jobPostingDate",
    );
  if (posted && dayStart(posted) > dayStart(new Date()) + 24 * 3600_000)
    throw new ValidationError(
      "Posted On can't be in the future.",
      "jobPostingDate",
    );
  if (posted && dayStart(deadline) < dayStart(posted))
    throw new ValidationError(
      "Apply By can't be before Posted On.",
      "applicationDeadline",
    );
  const deadlineChanged =
    !existing?.applicationDeadline ||
    dayStart(new Date(existing.applicationDeadline)) !== dayStart(deadline);
  if (deadlineChanged && dayStart(deadline) < dayStart(new Date()))
    throw new ValidationError(
      "Apply By can't be in the past.",
      "applicationDeadline",
    );
  out.jobPostingDate = posted ? posted.toISOString() : "";

  out.preferredSkills = str(body.preferredSkills, 1000);
  out.minQualification = str(body.minQualification, 200);
  out.responsibilities = str(body.responsibilities, 10_000);
  out.qualifications = str(body.qualifications, 10_000);
  out.department = str(body.department, 120);
  out.recruiter = str(body.recruiter, 120);

  out.applicationFormJson = JSON.stringify(
    normalizeFormConfig(parseJson(body.applicationForm)),
  );
  out.screeningQuestionsJson = JSON.stringify(
    normalizeScreeningQuestions(parseJson(body.screeningQuestions)),
  );
  return out;
}

// ── Candidate answers ───────────────────────────────────────────────────────

export const normalizeEmail = (e: unknown) =>
  typeof e === "string" ? e.trim().toLowerCase() : "";

/** "+<country code><number>". Bare 10-digit numbers are Indian (+91), which
 * is what the old form accepted; anything else must carry its country code. */
export function normalizeMobile(m: unknown): string | null {
  if (typeof m !== "string") return null;
  const t = m.trim();
  const digits = t.replace(/\D/g, "");
  if (t.startsWith("+"))
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export type ApplicationData = {
  name: string;
  email: string;
  mobile: string;
  resume: string;
  resumeName: string;
  profile: Record<string, string | number | boolean>;
  answers: Record<string, string | number | string[]>;
  coverLetter: string;
  consent: boolean;
};

/**
 * Keeps only known keys with bounded sizes — used for drafts, which may be
 * incomplete, so nothing is required here. Answers to questions the opening
 * no longer has, or whose type changed incompatibly, are dropped.
 */
export function sanitizeApplicationData(
  raw: any,
  questions: ScreeningQuestion[],
): ApplicationData {
  const r = raw && typeof raw === "object" ? raw : {};
  const profile: ApplicationData["profile"] = {};
  for (const [key, def] of Object.entries(PROFILE_FIELDS)) {
    const v = r.profile?.[key];
    if (v === undefined || v === null || v === "") continue;
    if (def.type === "yesno") {
      if (typeof v === "boolean") profile[key] = v;
    } else if (
      def.type === "years" ||
      def.type === "lpa" ||
      def.type === "days"
    ) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) profile[key] = n;
    } else if (typeof v === "string") {
      profile[key] = v.trim().slice(0, def.type === "url" ? 300 : 200);
    }
  }
  const answers: ApplicationData["answers"] = {};
  for (const q of questions) {
    const v = r.answers?.[q.id];
    if (v === undefined || v === null || v === "") continue;
    if (q.type === "multi_select") {
      if (Array.isArray(v))
        answers[q.id] = v.filter((o) => q.options.includes(o)).slice(0, 30);
    } else if (q.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) answers[q.id] = n;
    } else if (typeof v === "string") {
      if (q.type === "select" && !q.options.includes(v)) continue;
      if (q.type === "yes_no" && v !== "yes" && v !== "no") continue;
      answers[q.id] = v.slice(0, q.type === "long_text" ? 5000 : 500);
    }
  }
  return {
    name: str(r.name, 100),
    email: str(r.email, 254),
    mobile: str(r.mobile, 20),
    resume: str(r.resume, 1000),
    resumeName: str(r.resumeName, 200),
    profile,
    answers,
    coverLetter: str(r.coverLetter, 10_000),
    consent: r.consent === true,
  };
}

export type FieldErrors = Record<string, string>;

const blank = (v: unknown) =>
  v === undefined ||
  v === null ||
  v === "" ||
  (Array.isArray(v) && v.length === 0);

/** Full check before a draft becomes an application. Returns per-field
 * messages keyed the way the apply page names its inputs. */
export function validateApplication(
  data: ApplicationData,
  form: ApplicationFormConfig,
  questions: ScreeningQuestion[],
  isResumeOurs: (url: string) => boolean,
): FieldErrors {
  const e: FieldErrors = {};
  if (data.name.length < 2) e.name = "Enter your full name.";
  if (!EMAIL_RE.test(data.email)) e.email = "Enter a valid email address.";
  if (!normalizeMobile(data.mobile))
    e.mobile = "Enter a 10-digit mobile number, or include the country code.";
  if (data.resume && !isResumeOurs(data.resume))
    e.resume = "Upload your résumé again.";
  else if (!data.resume && form.resume === "required")
    e.resume = "Attach your résumé.";

  for (const [key, def] of Object.entries(PROFILE_FIELDS)) {
    const mode = form.fields[key];
    const v = data.profile[key];
    if (mode === "hidden") continue;
    if (blank(v)) {
      if (mode === "required")
        e[key] = `Enter your ${def.label.toLowerCase()}.`;
      continue;
    }
    if (def.type === "url" && !validUrl(String(v)))
      e[key] = "Enter a full link, starting with https://.";
    if (
      (def.type === "years" || def.type === "lpa") &&
      (Number(v) < 0 || Number(v) > 1000)
    )
      e[key] = "Enter a number from 0.";
    if (def.type === "days" && (Number(v) < 0 || Number(v) > 365))
      e[key] = "Enter a number of days from 0 to 365.";
  }
  const total = Number(data.profile.totalExperience);
  const relevant = Number(data.profile.relevantExperience);
  if (
    !e.relevantExperience &&
    Number.isFinite(total) &&
    Number.isFinite(relevant) &&
    relevant > total
  )
    e.relevantExperience = "Relevant experience can't be more than your total.";

  if (form.coverLetter === "required" && !data.coverLetter)
    e.coverLetter = "Add a cover letter.";

  for (const q of questions) {
    const v = data.answers[q.id];
    if (blank(v)) {
      if (q.required) e[`q:${q.id}`] = "Answer this question.";
      continue;
    }
    if (q.type === "date" && Number.isNaN(new Date(String(v)).getTime()))
      e[`q:${q.id}`] = "Enter a valid date.";
  }
  if (!data.consent) e.consent = "Confirm you've read the privacy notice.";
  return e;
}

/** Answers as stored on the application: label and type snapshotted so they
 * stay readable if the opening's questions change later. */
export const snapshotAnswers = (
  data: ApplicationData,
  questions: ScreeningQuestion[],
) =>
  questions
    .filter((q) => !blank(data.answers[q.id]))
    .map((q) => ({
      questionId: q.id,
      label: q.label,
      type: q.type,
      value: data.answers[q.id],
    }));

/** Only the profile fields the opening actually asks for. */
export const visibleProfile = (
  data: ApplicationData,
  form: ApplicationFormConfig,
) =>
  Object.fromEntries(
    Object.entries(data.profile).filter(([k]) => form.fields[k] !== "hidden"),
  );

export const PRIVACY_NOTICE_VERSION = "2026-10-30";
