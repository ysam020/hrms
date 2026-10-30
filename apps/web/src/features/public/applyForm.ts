import {
  PROFILE_FIELDS,
  jobConfig,
  type ApplicationFormConfig,
  type ProfileField,
  type ScreeningQuestion,
} from "@next/features/recruitment/jobConfig";

// Pure logic for the multi-step public application: which steps an opening
// needs, per-step checks (mirroring the gateway's validateApplication — the
// server re-checks everything on submit), and the browser-side copy that
// keeps answers through a refresh or a dropped connection.

export type Answers = {
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

export const emptyAnswers = (): Answers => ({
  name: "",
  email: "",
  mobile: "",
  resume: "",
  resumeName: "",
  profile: {},
  answers: {},
  coverLetter: "",
  consent: false,
});

export type StepKey =
  | "personal"
  | "professional"
  | "preferences"
  | "additional"
  | "review";

export type Step = {
  key: StepKey;
  title: string;
  fields: ProfileField[];
  resume?: boolean;
  questions?: ScreeningQuestion[];
  coverLetter?: boolean;
};

const TITLES: Record<StepKey, string> = {
  personal: "Personal Information",
  professional: "Professional Information",
  preferences: "Job Preferences",
  additional: "Additional Questions",
  review: "Review and Submit",
};

/** Steps with nothing to ask are left out; Personal and Review always stay. */
export function buildSteps(job: any): Step[] {
  const { form, questions } = jobConfig(job);
  const visible = (step: ProfileField["step"]) =>
    PROFILE_FIELDS.filter(
      (f) => f.step === step && form.fields[f.key] !== "hidden",
    );
  const sorted = [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const steps: Step[] = [
    { key: "personal", title: TITLES.personal, fields: visible("personal") },
    {
      key: "professional",
      title: TITLES.professional,
      fields: visible("professional"),
      resume: true,
    },
    {
      key: "preferences",
      title: TITLES.preferences,
      fields: visible("preferences"),
    },
    {
      key: "additional",
      title: TITLES.additional,
      fields: visible("additional"),
      questions: sorted,
      coverLetter: form.coverLetter !== "hidden",
    },
    { key: "review", title: TITLES.review, fields: [] },
  ];
  return steps.filter(
    (s) =>
      s.key === "personal" ||
      s.key === "review" ||
      s.fields.length ||
      s.resume ||
      s.questions?.length ||
      s.coverLetter,
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Country codes offered beside the mobile number; India is the default.
export const DIAL_CODES: [string, string][] = [
  ["+91", "India"],
  ["+1", "US / Canada"],
  ["+44", "UK"],
  ["+61", "Australia"],
  ["+65", "Singapore"],
  ["+971", "UAE"],
  ["+966", "Saudi Arabia"],
  ["+974", "Qatar"],
  ["+49", "Germany"],
  ["+33", "France"],
  ["+31", "Netherlands"],
  ["+353", "Ireland"],
  ["+64", "New Zealand"],
  ["+81", "Japan"],
  ["+60", "Malaysia"],
  ["+977", "Nepal"],
  ["+880", "Bangladesh"],
  ["+94", "Sri Lanka"],
];
export const DEFAULT_DIAL_CODE = "+91";

/** Splits a stored "+91 98765 43210" into code and number. Numbers saved
 * before the code picker existed (no "+") are Indian. */
export function splitMobile(value: string): { code: string; number: string } {
  const t = value.trim();
  if (!t.startsWith("+")) return { code: DEFAULT_DIAL_CODE, number: t };
  const digits = t.replace(/[^\d+]/g, "");
  const code = [...DIAL_CODES.map(([c]) => c)]
    .sort((a, b) => b.length - a.length)
    .find((c) => digits.startsWith(c));
  if (!code) return { code: DEFAULT_DIAL_CODE, number: t };
  const rest = t.slice(t.indexOf(code.slice(1)) + code.length - 1).trim();
  return { code, number: rest };
}

// An empty number keeps a non-default code, so choosing the country first
// isn't undone before the number is typed.
export const joinMobile = (code: string, number: string) =>
  number.trim()
    ? `${code} ${number.trim()}`
    : code === DEFAULT_DIAL_CODE
      ? ""
      : code;

export const validMobile = (m: string) => {
  const { code, number } = splitMobile(m);
  const d = number.replace(/\D/g, "");
  if (code === "+91") return d.length === 10;
  return d.length >= 6 && code.length - 1 + d.length <= 15;
};
const validUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};
const blank = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);

export type Errors = Record<string, string>;

export function validateStep(
  step: Step,
  a: Answers,
  form: ApplicationFormConfig,
): Errors {
  const e: Errors = {};
  if (step.key === "personal") {
    if (a.name.trim().length < 2) e.name = "Enter your full name.";
    if (!EMAIL_RE.test(a.email.trim()))
      e.email = "Enter a valid email address.";
    if (!validMobile(a.mobile))
      e.mobile =
        splitMobile(a.mobile).code === "+91"
          ? "Enter a 10-digit mobile number."
          : "Enter a valid mobile number.";
  }
  if (step.resume && form.resume === "required" && !a.resume)
    e.resume = "Attach your résumé.";
  for (const f of step.fields) {
    const v = a.profile[f.key];
    if (blank(v)) {
      if (form.fields[f.key] === "required")
        e[f.key] = `Enter your ${f.label.toLowerCase()}.`;
      continue;
    }
    if (f.type === "url" && !validUrl(String(v)))
      e[f.key] = "Enter a full link, starting with https://.";
    if ((f.type === "years" || f.type === "lpa") && !(Number(v) >= 0))
      e[f.key] = "Enter a number from 0.";
    if (f.type === "days" && !(Number(v) >= 0 && Number(v) <= 365))
      e[f.key] = "Enter a number of days from 0 to 365.";
  }
  if (
    step.key === "professional" &&
    !e.relevantExperience &&
    Number(a.profile.relevantExperience) > Number(a.profile.totalExperience)
  )
    e.relevantExperience = "Relevant experience can't be more than your total.";
  for (const q of step.questions ?? []) {
    if (q.required && blank(a.answers[q.id!]))
      e[`q:${q.id}`] = "Answer this question.";
  }
  if (
    step.coverLetter &&
    form.coverLetter === "required" &&
    !a.coverLetter.trim()
  )
    e.coverLetter = "Add a cover letter.";
  if (step.key === "review" && !a.consent)
    e.consent = "Confirm you've read the privacy notice.";
  return e;
}

/** Every step's problems at once — for the review step and server errors. */
export function validateAll(
  steps: Step[],
  a: Answers,
  form: ApplicationFormConfig,
) {
  const out: { step: number; errors: Errors }[] = [];
  steps.forEach((s, i) => {
    const errors = validateStep(s, a, form);
    if (Object.keys(errors).length) out.push({ step: i, errors });
  });
  return out;
}

/** Which step shows a field the server complained about. */
export function stepOfField(steps: Step[], field: string): number {
  if (["name", "email", "mobile"].includes(field)) return 0;
  if (field === "consent") return steps.length - 1;
  const i = steps.findIndex(
    (s) =>
      (field === "resume" && s.resume) ||
      (field === "coverLetter" && s.coverLetter) ||
      s.fields.some((f) => f.key === field) ||
      s.questions?.some((q) => `q:${q.id}` === field),
  );
  return i < 0 ? 0 : i;
}

// ── Browser-side recovery ───────────────────────────────────────────────────

/**
 * What this browser keeps per opening: the draft handle and the latest
 * answers. Never a résumé's contents (only its uploaded link and name) and
 * never Aadhaar, which the form doesn't ask for. `baseRevision` is the
 * server revision these answers were built on, and `dirty` means they
 * haven't reached the server yet.
 */
export type LocalDraft = {
  draftId?: string;
  token?: string;
  baseRevision: number;
  dirty: boolean;
  savedAt: number;
  answers: Answers;
};

const KEY = (slug: string, jobId: string) => `praesto:apply:${slug}:${jobId}`;

export function readLocal(slug: string, jobId: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(KEY(slug, jobId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || !v.answers) return null;
    return { ...v, answers: { ...emptyAnswers(), ...v.answers } };
  } catch {
    return null;
  }
}

/** Returns false when the browser won't store it (private mode, quota). */
export function writeLocal(
  slug: string,
  jobId: string,
  d: LocalDraft,
): boolean {
  try {
    localStorage.setItem(KEY(slug, jobId), JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal(slug: string, jobId: string) {
  try {
    localStorage.removeItem(KEY(slug, jobId));
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/**
 * Decides what to show when both this browser and the server have a copy.
 * Unsaved local answers built on the server's current revision are newer and
 * are kept (and then saved). If the server has moved on since — another
 * device saved — neither side is dropped silently: the caller asks.
 */
export function reconcile(
  local: LocalDraft | null,
  server: { revision: number; data: Answers },
): "server" | "local" | "ask" {
  if (!local || !local.dirty) return "server";
  if (local.baseRevision === server.revision) return "local";
  return "ask";
}
