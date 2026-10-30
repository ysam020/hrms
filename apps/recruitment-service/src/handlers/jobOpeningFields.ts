// Maps the location / application-form fields of a CreateJobRequest onto
// JobOpening columns. The gateway has already validated them
// (services/recruitmentForms.ts there); this only converts wire formats.
// Proto strings arrive as "" when unset, so on update an empty value means
// "leave as is" unless the field is named in `clearedFields`.

const parseJson = (v: string) => {
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
};

export function jobOpeningExtraFields(
  req: any,
  mode: "create" | "update",
): Record<string, any> {
  const cleared = new Set<string>(req.clearedFields ?? []);
  const out: Record<string, any> = {};
  const text = (field: string) => {
    const v = req[field];
    if (v) out[field] = v;
    else if (mode === "create" || cleared.has(field)) out[field] = null;
  };
  [
    "employmentType",
    "workplaceType",
    "remoteScope",
    "preferredSkills",
    "minQualification",
    "responsibilities",
    "qualifications",
    "recruiter",
    "department",
  ].forEach(text);

  const json = (wire: string, column: string) => {
    const v = req[wire];
    if (v) {
      const parsed = parseJson(v);
      if (parsed !== undefined) out[column] = parsed;
    } else if (mode === "create" || cleared.has(column)) out[column] = null;
  };
  json("locationsJson", "locations");
  json("applicationFormJson", "applicationForm");
  json("screeningQuestionsJson", "screeningQuestions");

  if (req.workplaceType || mode === "create")
    out.remoteRegions = Array.isArray(req.remoteRegions)
      ? req.remoteRegions
      : [];

  if (req.experienceMax) {
    const n = parseFloat(req.experienceMax);
    if (Number.isFinite(n)) out.experienceMax = n;
  } else if (mode === "create" || cleared.has("experienceMax"))
    out.experienceMax = null;

  if (req.budgetDisclosed === "true") out.budgetDisclosed = true;
  else if (req.budgetDisclosed === "false") out.budgetDisclosed = false;

  if (req.jobPostingDate) {
    const d = new Date(req.jobPostingDate);
    if (!Number.isNaN(d.getTime())) out.jobPostingDate = d;
  }
  return out;
}
