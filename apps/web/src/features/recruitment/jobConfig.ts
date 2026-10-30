// Labels and defaults for job openings' location and application-form
// settings, shared by the job editor, recruiter views and the public careers
// pages. The gateway's services/recruitmentForms.ts is the authority — keep
// keys and defaults in step with it.

export const EMPLOYMENT_TYPES = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["internship", "Internship"],
  ["temporary", "Temporary"],
  ["other", "Other"],
] as const;

export const WORKPLACE_TYPES = [
  ["onsite", "On-site"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
] as const;

export const REMOTE_SCOPES = [
  ["anywhere", "Anywhere"],
  ["country", "One country"],
  ["regions", "Selected countries or regions"],
] as const;

export const VISIBILITIES = [
  ["external", "Careers page"],
  ["both", "Careers page and employees"],
  ["internal", "Employees only"],
] as const;

const labelOf = (list: readonly (readonly [string, string])[], v?: string) =>
  list.find(([k]) => k === v)?.[1] ?? "";

export const employmentTypeLabel = (v?: string) => labelOf(EMPLOYMENT_TYPES, v);
export const workplaceTypeLabel = (v?: string) => labelOf(WORKPLACE_TYPES, v);

export type FieldMode = "hidden" | "optional" | "required";
export type ProfileFieldType =
  | "text"
  | "url"
  | "years"
  | "lpa"
  | "days"
  | "yesno";

export type ProfileField = {
  key: string;
  label: string;
  type: ProfileFieldType;
  default: FieldMode;
  step: "personal" | "professional" | "preferences" | "additional";
  hint?: string;
  autoComplete?: string;
};

export const PROFILE_FIELDS: ProfileField[] = [
  {
    key: "currentLocation",
    label: "Current Location",
    type: "text",
    default: "required",
    step: "personal",
    hint: "City and country",
    autoComplete: "address-level2",
  },
  {
    key: "totalExperience",
    label: "Total Experience",
    type: "years",
    default: "required",
    step: "professional",
    hint: "In years, e.g. 3.5",
  },
  {
    key: "relevantExperience",
    label: "Relevant Experience",
    type: "years",
    default: "optional",
    step: "professional",
    hint: "In years",
  },
  {
    key: "currentCompany",
    label: "Current Company",
    type: "text",
    default: "optional",
    step: "professional",
    autoComplete: "organization",
  },
  {
    key: "currentDesignation",
    label: "Current Designation",
    type: "text",
    default: "optional",
    step: "professional",
    autoComplete: "organization-title",
  },
  {
    key: "skills",
    label: "Key Skills",
    type: "text",
    default: "optional",
    step: "professional",
    hint: "Separate with commas",
  },
  {
    key: "highestQualification",
    label: "Highest Qualification",
    type: "text",
    default: "optional",
    step: "professional",
    hint: "e.g. B.Tech, Computer Science",
  },
  {
    key: "expectedCtc",
    label: "Expected CTC",
    type: "lpa",
    default: "optional",
    step: "preferences",
    hint: "In lakhs per annum",
  },
  {
    key: "currentCtc",
    label: "Current CTC",
    type: "lpa",
    default: "hidden",
    step: "preferences",
    hint: "In lakhs per annum",
  },
  {
    key: "noticePeriod",
    label: "Notice Period",
    type: "days",
    default: "optional",
    step: "preferences",
    hint: "In days; 0 if you can join now",
  },
  {
    key: "preferredLocation",
    label: "Preferred Work Location",
    type: "text",
    default: "hidden",
    step: "preferences",
  },
  {
    key: "willingToRelocate",
    label: "Willing to Relocate",
    type: "yesno",
    default: "hidden",
    step: "preferences",
  },
  {
    key: "linkedinUrl",
    label: "LinkedIn Profile",
    type: "url",
    default: "optional",
    step: "additional",
    hint: "https://linkedin.com/in/…",
    autoComplete: "url",
  },
  {
    key: "portfolioUrl",
    label: "Portfolio",
    type: "url",
    default: "hidden",
    step: "additional",
    hint: "https://…",
  },
  {
    key: "githubUrl",
    label: "GitHub",
    type: "url",
    default: "hidden",
    step: "additional",
    hint: "https://github.com/…",
  },
];

export type ApplicationFormConfig = {
  fields: Record<string, FieldMode>;
  resume: "optional" | "required";
  coverLetter: FieldMode;
};

const MODES: FieldMode[] = ["hidden", "optional", "required"];

export function normalizeFormConfig(raw: any): ApplicationFormConfig {
  const fields: Record<string, FieldMode> = {};
  for (const f of PROFILE_FIELDS) {
    const m = raw?.fields?.[f.key];
    fields[f.key] = MODES.includes(m) ? m : f.default;
  }
  return {
    fields,
    resume: raw?.resume === "optional" ? "optional" : "required",
    coverLetter: MODES.includes(raw?.coverLetter) ? raw.coverLetter : "hidden",
  };
}

export type QuestionType =
  | "short_text"
  | "long_text"
  | "select"
  | "multi_select"
  | "yes_no"
  | "number"
  | "date";

export const QUESTION_TYPES: [QuestionType, string][] = [
  ["short_text", "Short answer"],
  ["long_text", "Paragraph"],
  ["select", "Dropdown (one choice)"],
  ["multi_select", "Checkboxes (several choices)"],
  ["yes_no", "Yes / No"],
  ["number", "Number"],
  ["date", "Date"],
];
export const hasOptions = (t: QuestionType) =>
  t === "select" || t === "multi_select";

export type ScreeningQuestion = {
  id?: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options: string[];
  helpText: string;
  order?: number;
};

export type JobLocation = {
  country: string;
  state: string;
  city: string;
  office: string;
};

const parse = (v: any) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

/** Location/form fields of an opening, whether it came from the recruiter
 * API (JSON strings) or the public API (already objects). */
export function jobConfig(job: any) {
  const locations = parse(job?.locations ?? job?.locationsJson);
  const questions = parse(
    job?.screeningQuestions ?? job?.screeningQuestionsJson,
  );
  return {
    locations: (Array.isArray(locations) ? locations : []) as JobLocation[],
    questions: (Array.isArray(questions)
      ? questions
      : []) as ScreeningQuestion[],
    form: normalizeFormConfig(
      parse(job?.applicationForm ?? job?.applicationFormJson),
    ),
  };
}

const place = (l: JobLocation) =>
  [l.city, l.state, l.country].filter(Boolean).join(", ");

/** "Bengaluru, Karnataka, India", "Remote · India", "Hybrid · Pune +1". */
export function locationSummary(job: any): string {
  const { locations } = jobConfig(job);
  if (job?.workplaceType === "remote") {
    const regions: string[] = job.remoteRegions ?? [];
    return regions.length
      ? `Remote · ${regions.join(", ")}`
      : "Remote · Anywhere";
  }
  if (!locations.length) return "";
  const first = place(locations[0]);
  const more = locations.length > 1 ? ` +${locations.length - 1}` : "";
  return job?.workplaceType === "hybrid"
    ? `Hybrid · ${first}${more}`
    : `${first}${more}`;
}

export function experienceLabel(job: any): string | null {
  if (job?.experience == null || job.experience === "") return null;
  const max =
    job.experienceMax ?? (job.hasExperienceMax ? job.experienceMax : null);
  return max != null && max !== "" && Number(max) > Number(job.experience)
    ? `${job.experience}–${max} years`
    : `${job.experience}+ years`;
}
