import dayjs from "dayjs";
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import useJobTitleOptions from "@web/features/job-openings/useJobTitleOptions";
import { useTransitionNavigate } from "@next/motion";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  FormSection,
  IconButton,
  Page,
  ReviewSection,
  SegmentedControl,
  Select,
  StepHeader,
  Stepper,
  Switch,
  Tag,
  TextArea,
  TextInput,
  WizardFooter,
  WizardLayout,
  fieldSpan2,
  focusFirstInvalid,
  inlineCheckClass,
  SectionsSkeleton,
  useWizard,
  type WizardStep,
} from "@next/ui";
import { apiClient, asList, errorMessage, unwrap } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { fmtDate, personName } from "@next/lib/format";
import {
  EMPLOYMENT_TYPES,
  REMOTE_SCOPES,
  VISIBILITIES,
  WORKPLACE_TYPES,
  employmentTypeLabel,
  hasOptions,
  jobConfig,
  normalizeFormConfig,
  type ApplicationFormConfig,
  type JobLocation,
  type ScreeningQuestion,
  workplaceTypeLabel,
} from "./jobConfig";
import {
  FormFieldsEditor,
  ScreeningQuestionsEditor,
} from "./ApplicationFormEditor";
import s from "./job.module.css";

// New / edit job opening as a guided, seven-step form ending in a review.
// Designations come from Classic's useJobTitleOptions; budget is in LPA, as
// it always was. The gateway re-validates everything here
// (services/recruitmentForms.ts) and names the failing field, which is shown
// against that field on its step.

type V = {
  jobTitle: string;
  department: string;
  numberOfVacancies: string;
  visibility: string;
  employmentType: string;
  workplaceType: string;
  locations: JobLocation[];
  remoteScope: string;
  remoteRegions: string;
  experience: string;
  experienceMax: string;
  requiredSkills: string;
  preferredSkills: string;
  minQualification: string;
  budgetMin: string;
  budgetMax: string;
  budgetDisclosed: boolean;
  hiringManager: string;
  recruiter: string;
  pipelineTemplateId: string;
  applicationForm: ApplicationFormConfig;
  screeningQuestions: ScreeningQuestion[];
  jobDescription: string;
  responsibilities: string;
  qualifications: string;
  jobPostingDate: string;
  applicationDeadline: string;
};

const blankLocation = (): JobLocation => ({
  country: "India",
  state: "",
  city: "",
  office: "",
});

const EMPTY: V = {
  jobTitle: "",
  department: "",
  numberOfVacancies: "1",
  visibility: "external",
  employmentType: "full_time",
  workplaceType: "onsite",
  locations: [blankLocation()],
  remoteScope: "anywhere",
  remoteRegions: "",
  experience: "",
  experienceMax: "",
  requiredSkills: "",
  preferredSkills: "",
  minQualification: "",
  budgetMin: "",
  budgetMax: "",
  budgetDisclosed: false,
  hiringManager: "",
  recruiter: "",
  pipelineTemplateId: "",
  applicationForm: normalizeFormConfig(null),
  screeningQuestions: [],
  jobDescription: "",
  responsibilities: "",
  qualifications: "",
  jobPostingDate: dayjs().format("YYYY-MM-DD"),
  applicationDeadline: "",
};

const csv = (v: string) =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** Instant feedback for the common mistakes; the gateway is the authority. */
function check(v: V, editing: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.jobTitle.trim().length < 2) e.jobTitle = "Enter the job title.";
  const n = Number(v.numberOfVacancies);
  if (!Number.isInteger(n) || n < 1)
    e.numberOfVacancies = "Enter a whole number from 1.";
  if (!v.employmentType) e.employmentType = "Choose an employment type.";
  if (!v.workplaceType) e.workplaceType = "Choose a workplace type.";
  if (v.workplaceType === "onsite" || v.workplaceType === "hybrid") {
    if (
      !v.locations.length ||
      v.locations.some((l) => !l.city.trim() || !l.country.trim())
    )
      e.locations = "Each location needs a city and country.";
  }
  if (v.workplaceType === "remote") {
    const regions = csv(v.remoteRegions);
    if (v.remoteScope === "country" && regions.length !== 1)
      e.remoteRegions = "Enter one country.";
    if (v.remoteScope === "regions" && !regions.length)
      e.remoteRegions = "Enter at least one country or region.";
  }
  const min = Number(v.experience);
  if (v.experience.trim() === "" || !Number.isFinite(min) || min < 0)
    e.experience = "Enter the minimum years, e.g. 3.";
  if (v.experienceMax.trim() !== "" && !(Number(v.experienceMax) >= min))
    e.experienceMax = "Can't be less than the minimum.";
  if (v.requiredSkills.trim().length < 2)
    e.requiredSkills = "Enter at least one skill.";
  const [b0, b1] = [v.budgetMin.trim(), v.budgetMax.trim()];
  if (b0 || b1) {
    if (!b0 || !b1) e.budgetMax = "Enter both ends, or neither.";
    else if (Number(b0) < 0 || Number(b1) < 0)
      e.budgetMax = "Budgets can't be negative.";
    else if (Number(b0) > Number(b1))
      e.budgetMax = "Budget From can't be more than Budget To.";
  }
  if (!v.hiringManager) e.hiringManager = "Choose the hiring manager.";
  if (v.jobDescription.trim().length < 10)
    e.jobDescription = "Describe the role in at least a sentence.";
  if (!v.applicationDeadline)
    e.applicationDeadline = "Choose the Apply By date.";
  else if (v.jobPostingDate && v.applicationDeadline < v.jobPostingDate)
    e.applicationDeadline = "Apply By can't be before Posted On.";
  else if (!editing && v.applicationDeadline < dayjs().format("YYYY-MM-DD"))
    e.applicationDeadline = "Apply By can't be in the past.";
  v.screeningQuestions.forEach((q, i) => {
    if (e.screeningQuestions) return;
    if (!q.label.trim())
      e.screeningQuestions = `Question ${i + 1} needs a label.`;
    else if (hasOptions(q.type) && q.options.filter((o) => o.trim()).length < 2)
      e.screeningQuestions = `Question ${i + 1} needs at least two choices.`;
  });
  return e;
}

type Step = WizardStep & { description: string; fields: string[] };

const STEPS: Step[] = [
  {
    id: "basics",
    title: "Basics",
    summary: "Title, openings, type",
    description: "Name the role so candidates can find it.",
    fields: [
      "jobTitle",
      "department",
      "numberOfVacancies",
      "employmentType",
      "visibility",
    ],
  },
  {
    id: "workplace",
    title: "Workplace",
    summary: "On-site, hybrid or remote",
    description: "Where the person will work.",
    fields: ["workplaceType", "locations", "remoteScope", "remoteRegions"],
  },
  {
    id: "requirements",
    title: "Requirements",
    summary: "Experience and skills",
    description: "Who you’re looking for.",
    fields: [
      "experience",
      "experienceMax",
      "requiredSkills",
      "preferredSkills",
      "minQualification",
    ],
  },
  {
    id: "description",
    title: "Description",
    summary: "The role in words",
    description: "What the job is, in the words candidates will read.",
    fields: ["jobDescription", "responsibilities", "qualifications"],
  },
  {
    id: "hiring",
    title: "Pay & Hiring",
    summary: "Budget, team, dates",
    description: "Budget, who runs the hiring, and when applications close.",
    fields: [
      "budget",
      "budgetMin",
      "budgetMax",
      "budgetDisclosed",
      "hiringManager",
      "recruiter",
      "pipelineTemplateId",
      "jobPostingDate",
      "applicationDeadline",
    ],
  },
  {
    id: "application",
    title: "Application",
    summary: "Form and screening",
    description: "What candidates fill in when they apply.",
    fields: ["applicationForm", "screeningQuestions"],
  },
  {
    id: "review",
    title: "Review",
    summary: "Check and publish",
    description: "Check the opening as a whole before it goes live.",
    fields: [],
  },
];
const REVIEW = STEPS.length - 1;
/** The step that owns a field; unknown fields (e.g. from the server) → Review. */
const stepOfField = (k: string) => {
  const i = STEPS.findIndex((st) => st.fields.includes(k));
  return i < 0 ? REVIEW : i;
};

export function NewJobPage() {
  return <JobEditor />;
}

export function EditJobPage() {
  const { _id = "" } = useParams();
  return <JobEditor id={_id} />;
}

function JobEditor({ id }: { id?: string }) {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const navigate = useTransitionNavigate();
  const existing = useGet<any>(
    id ? `/view-job-opening/${encodeURIComponent(id)}` : null,
  );
  const people = useGet<any>("/get-all-users?limit=1000");
  const templates = useGet<any>(
    API_ENDPOINTS.LIST_INTERVIEW_PIPELINE_TEMPLATES,
  );
  const { options: titleOptions, ensureJobTitleSaved } = useJobTitleOptions();
  const [v, setV] = useState<V>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const wizard = useWizard(STEPS.length);
  const { reachAll } = wizard;

  useEffect(() => {
    const j = existing.data?.data ?? existing.data;
    if (!j || j.message || !j.id) return;
    const cfg = jobConfig(j);
    setV({
      jobTitle: j.jobTitle ?? "",
      department: j.department ?? "",
      numberOfVacancies: String(j.numberOfVacancies || 1),
      visibility: j.visibility || "external",
      employmentType: j.employmentType ?? "",
      workplaceType: j.workplaceType ?? "",
      locations: cfg.locations.length ? cfg.locations : [blankLocation()],
      remoteScope: j.remoteScope || "anywhere",
      remoteRegions: (j.remoteRegions ?? []).join(", "),
      experience: j.experience != null ? String(j.experience) : "",
      experienceMax: j.hasExperienceMax ? String(j.experienceMax) : "",
      requiredSkills: Array.isArray(j.requiredSkills)
        ? j.requiredSkills.join(", ")
        : (j.requiredSkills ?? ""),
      preferredSkills: j.preferredSkills ?? "",
      minQualification: j.minQualification ?? "",
      budgetMin:
        Array.isArray(j.budget) && j.budget.length ? String(j.budget[0]) : "",
      budgetMax:
        Array.isArray(j.budget) && j.budget.length ? String(j.budget[1]) : "",
      budgetDisclosed: j.budgetDisclosed !== false,
      hiringManager: j.hiringManager ?? "",
      recruiter: j.recruiter ?? "",
      pipelineTemplateId: j.pipelineTemplateId ?? "",
      applicationForm: cfg.form,
      screeningQuestions: cfg.questions.map((q) => ({
        ...q,
        options: q.options ?? [],
        helpText: q.helpText ?? "",
      })),
      jobDescription: j.jobDescription ?? "",
      responsibilities: j.responsibilities ?? "",
      qualifications: j.qualifications ?? "",
      jobPostingDate: (j.jobPostingDate ?? "").slice(0, 10),
      applicationDeadline: (j.applicationDeadline ?? "").slice(0, 10),
    });
    // An existing opening is complete: any step can be opened directly.
    reachAll();
  }, [existing.data, reachAll]);

  const users = asList<any>(people.data, "users");
  // Classic stores the hiring manager as an uppercase display name.
  const managers = useMemo(
    () =>
      users
        .map((u) =>
          personName({
            ...u,
            first_name: u.firstName ?? u.first_name,
            last_name: u.lastName ?? u.last_name,
          }).toUpperCase(),
        )
        .filter(Boolean)
        .sort(),
    [users],
  );
  const departments = useMemo(
    () =>
      [
        ...new Set(users.map((u) => u.department).filter(Boolean)),
      ].sort() as string[],
    [users],
  );
  const pipelineOptions = asList<any>(templates.data).filter((t) => t.isActive);

  const patch = (p: Partial<V>) => {
    setV((x) => ({ ...x, ...p }));
    const keys = Object.keys(p);
    if (keys.some((k) => errors[k]))
      setErrors((x) => {
        const n = { ...x };
        keys.forEach((k) => delete n[k]);
        return n;
      });
  };
  const set = (k: keyof V) => (e: { target: { value: string } }) =>
    patch({ [k]: e.target.value } as Partial<V>);
  const setLocation = (i: number, p: Partial<JobLocation>) =>
    patch({
      locations: v.locations.map((l, j) => (j === i ? { ...l, ...p } : l)),
    });

  const buildPayload = () => {
    const onSite = v.workplaceType !== "remote";
    return {
      jobTitle: v.jobTitle.trim(),
      department: v.department.trim(),
      numberOfVacancies: Number(v.numberOfVacancies),
      visibility: v.visibility,
      employmentType: v.employmentType,
      workplaceType: v.workplaceType,
      locations: onSite ? v.locations : [],
      remoteScope: onSite ? "" : v.remoteScope,
      remoteRegions:
        onSite || v.remoteScope === "anywhere" ? [] : csv(v.remoteRegions),
      experience: v.experience.trim(),
      experienceMax: v.experienceMax.trim(),
      requiredSkills: v.requiredSkills.trim(),
      preferredSkills: v.preferredSkills.trim(),
      minQualification: v.minQualification.trim(),
      budget:
        v.budgetMin.trim() || v.budgetMax.trim()
          ? [v.budgetMin, v.budgetMax]
          : [],
      budgetDisclosed: v.budgetDisclosed,
      hiringManager: v.hiringManager,
      recruiter: v.recruiter,
      pipelineTemplateId: v.pipelineTemplateId || undefined,
      applicationForm: v.applicationForm,
      screeningQuestions: v.screeningQuestions.map((q) => ({
        ...q,
        options: q.options.map((o) => o.trim()).filter(Boolean),
      })),
      jobDescription: v.jobDescription.trim(),
      responsibilities: v.responsibilities.trim(),
      qualifications: v.qualifications.trim(),
      jobPostingDate: v.jobPostingDate,
      applicationDeadline: v.applicationDeadline,
    };
  };

  // Every problem right now; each step blocks "Continue" only on its own.
  const problems = useMemo(() => check(v, !!id), [v, id]);
  const flagged = useMemo(
    () => [
      ...new Set(
        Object.keys(errors)
          .filter((k) => errors[k])
          .map(stepOfField),
      ),
    ],
    [errors],
  );

  const checkStep = (i: number) => {
    const found = Object.fromEntries(
      Object.entries(problems).filter(([k]) => stepOfField(k) === i),
    );
    setErrors((x) => {
      const n = Object.fromEntries(
        Object.entries(x).filter(([k]) => stepOfField(k) !== i),
      );
      return { ...n, ...found };
    });
    if (Object.keys(found).length) {
      document
        .querySelector(`[data-field="${Object.keys(found)[0]}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      focusFirstInvalid();
      return false;
    }
    return true;
  };
  const onContinue = () => {
    if (checkStep(wizard.current)) wizard.next();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (wizard.current !== REVIEW) return onContinue();
    if (Object.keys(problems).length) {
      setErrors(problems);
      return;
    }
    setSaving(true);
    try {
      void ensureJobTitleSaved(v.jobTitle);
      const payload = buildPayload();
      if (id) {
        await apiClient.put(API_ENDPOINTS.EDIT_JOB_OPENING(id), payload);
        setAlert({
          open: true,
          message: "Opening updated.",
          severity: "success",
        });
        navigate(`/view-job-opening/${id}`);
      } else {
        const res = await apiClient.post(
          API_ENDPOINTS.ADD_JOB_OPENING,
          payload,
        );
        setAlert({
          open: true,
          message: res.data?.message || "Opening published.",
          severity: "success",
        });
        const newId = unwrap<any>(res)?.id;
        if (newId) setCreated(newId);
        else navigate("/job-openings/view-job-openings");
      }
    } catch (err: any) {
      const field = err?.response?.data?.field;
      if (field) {
        setErrors({ [field]: errorMessage(err) });
        // The gateway names the failing field; open its step.
        const at = stepOfField(field);
        if (at !== REVIEW) wizard.go(at);
      }
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const applyLink =
    created && user?.tenantSlug
      ? `${window.location.origin}/careers/${user.tenantSlug}/apply/${created}`
      : null;

  const fieldsAsked = Object.entries(v.applicationForm.fields).filter(
    ([, m]) => m !== "hidden",
  ).length;
  const budgetText =
    v.budgetMin.trim() && v.budgetMax.trim()
      ? `${v.budgetMin}–${v.budgetMax} LPA${v.budgetDisclosed ? "" : " (not shown to candidates)"}`
      : "Not set";
  const issuesFor = (i: number) =>
    Object.entries(problems)
      .filter(([k]) => stepOfField(k) === i)
      .map(([, m]) => m);
  const excerpt = (text: string) =>
    text.length > 220 ? `${text.slice(0, 220).trimEnd()}…` : text;

  const steps = [
    // 0 — Basics
    <FormSection
      key="basics"
      icon="briefcase"
      title="Role"
      description="What you’re hiring for and how many people."
    >
      <FormGrid columns={2}>
        <Field label="Job Title" error={errors.jobTitle} className={fieldSpan2}>
          <TextInput
            data-autofocus
            data-field="jobTitle"
            list="job-titles"
            value={v.jobTitle}
            onChange={set("jobTitle")}
          />
        </Field>
        <datalist id="job-titles">
          {(titleOptions as any[]).map((o) => (
            <option
              key={String(o.value ?? o)}
              value={String(o.value ?? o.label ?? o)}
            />
          ))}
        </datalist>
        <Field label="Department" optional error={errors.department}>
          <TextInput
            list="job-departments"
            value={v.department}
            onChange={set("department")}
          />
        </Field>
        <datalist id="job-departments">
          {departments.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <Field label="Openings" error={errors.numberOfVacancies}>
          <TextInput
            data-field="numberOfVacancies"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={v.numberOfVacancies}
            onChange={set("numberOfVacancies")}
          />
        </Field>
        <Field label="Employment Type" error={errors.employmentType}>
          <Select
            data-field="employmentType"
            value={v.employmentType}
            onChange={set("employmentType")}
          >
            {!v.employmentType && <option value="">Choose…</option>}
            {EMPLOYMENT_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Who Can See It"
          hint="Employees-only openings never appear on the careers page."
        >
          <Select value={v.visibility} onChange={set("visibility")}>
            {VISIBILITIES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
    </FormSection>,

    // 1 — Workplace and location
    <FormSection
      key="where"
      icon="pin"
      title="Workplace"
      description={
        v.workplaceType === "remote"
          ? "Remote roles don’t need an office. Say where candidates can work from."
          : "Where the team works. Add every office this role can be based in."
      }
    >
      <div
        data-field="workplaceType"
        style={{ display: "grid", gap: 6, justifyItems: "start" }}
      >
        <span className="px-label">Workplace Type</span>
        <SegmentedControl
          label="Workplace type"
          role="radiogroup"
          segments={WORKPLACE_TYPES.map(([value, label]) => ({
            value,
            label,
          }))}
          value={v.workplaceType as any}
          onChange={(workplaceType) => patch({ workplaceType })}
        />
        {errors.workplaceType && (
          <span
            className="px-meta"
            role="alert"
            style={{ color: "var(--px-danger)" }}
          >
            {errors.workplaceType}
          </span>
        )}
      </div>
      {v.workplaceType === "remote" ? (
        <FormGrid columns={2}>
          <Field label="Can Work From">
            <Select value={v.remoteScope} onChange={set("remoteScope")}>
              {REMOTE_SCOPES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          {v.remoteScope !== "anywhere" && (
            <Field
              label={
                v.remoteScope === "country" ? "Country" : "Countries or Regions"
              }
              hint={
                v.remoteScope === "country"
                  ? "e.g. India"
                  : "Separate with commas"
              }
              error={errors.remoteRegions}
            >
              <TextInput
                data-field="remoteRegions"
                value={v.remoteRegions}
                onChange={set("remoteRegions")}
              />
            </Field>
          )}
        </FormGrid>
      ) : (
        <div data-field="locations" className={s.editor}>
          {v.locations.map((l, i) => (
            <fieldset key={i} className={s.locationCard}>
              <legend className={s.locationLegend}>
                {v.locations.length > 1 ? `Location ${i + 1}` : "Location"}
              </legend>
              <div className={s.location}>
                <Field label="City">
                  <TextInput
                    aria-invalid={
                      errors.locations && !l.city.trim() ? true : undefined
                    }
                    value={l.city}
                    onChange={(e) => setLocation(i, { city: e.target.value })}
                  />
                </Field>
                <Field label="State or Region" optional>
                  <TextInput
                    value={l.state}
                    onChange={(e) => setLocation(i, { state: e.target.value })}
                  />
                </Field>
                <Field label="Country">
                  <TextInput
                    aria-invalid={
                      errors.locations && !l.country.trim() ? true : undefined
                    }
                    value={l.country}
                    onChange={(e) =>
                      setLocation(i, { country: e.target.value })
                    }
                  />
                </Field>
                <Field label="Office Address" optional>
                  <TextInput
                    value={l.office}
                    onChange={(e) => setLocation(i, { office: e.target.value })}
                  />
                </Field>
                <IconButton
                  icon="trash"
                  label={`Remove location ${i + 1}`}
                  disabled={v.locations.length === 1}
                  onClick={() =>
                    patch({
                      locations: v.locations.filter((_, j) => j !== i),
                    })
                  }
                />
              </div>
            </fieldset>
          ))}
          {errors.locations && (
            <p
              className="px-meta"
              role="alert"
              style={{ color: "var(--px-danger)" }}
            >
              {errors.locations}
            </p>
          )}
          <div>
            <Button
              icon="plus"
              disabled={v.locations.length >= 10}
              onClick={() =>
                patch({ locations: [...v.locations, blankLocation()] })
              }
            >
              Add Another Location
            </Button>
          </div>
        </div>
      )}
    </FormSection>,

    // 2 — Requirements
    <FormSection
      key="reqs"
      icon="checklist"
      title="Experience and Skills"
      description="Candidates see these on the careers page and when they apply."
    >
      <FormGrid columns={2}>
        <Field
          label="Minimum Experience"
          hint="In years"
          error={errors.experience}
        >
          <TextInput
            data-field="experience"
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={v.experience}
            onChange={set("experience")}
          />
        </Field>
        <Field
          label="Maximum Experience"
          optional
          hint="In years"
          error={errors.experienceMax}
        >
          <TextInput
            data-field="experienceMax"
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={v.experienceMax}
            onChange={set("experienceMax")}
          />
        </Field>
        <Field
          label="Required Skills"
          error={errors.requiredSkills}
          hint="Separate with commas"
          className={fieldSpan2}
        >
          <TextInput
            data-field="requiredSkills"
            value={v.requiredSkills}
            onChange={set("requiredSkills")}
          />
        </Field>
        {csv(v.requiredSkills).length > 0 && (
          <div className={`${s.chips} ${fieldSpan2}`} aria-hidden>
            {csv(v.requiredSkills).map((k) => (
              <Tag key={k} tone="accent">
                {k}
              </Tag>
            ))}
          </div>
        )}
        <Field
          label="Preferred Skills"
          optional
          hint="Separate with commas"
          className={fieldSpan2}
        >
          <TextInput
            value={v.preferredSkills}
            onChange={set("preferredSkills")}
          />
        </Field>
        <Field label="Minimum Qualification" optional className={fieldSpan2}>
          <TextInput
            value={v.minQualification}
            onChange={set("minQualification")}
          />
        </Field>
      </FormGrid>
    </FormSection>,

    // 3 — Description
    <FormSection
      key="desc"
      icon="doc"
      title="Description"
      description="Lead with what the person will do. Plain paragraphs work best."
    >
      <FormGrid columns={1}>
        <Field
          label="About the Role"
          error={errors.jobDescription}
          hint={`${v.jobDescription.trim().length} characters · at least 10`}
        >
          <TextArea
            data-field="jobDescription"
            rows={8}
            value={v.jobDescription}
            onChange={set("jobDescription")}
          />
        </Field>
        <Field label="Responsibilities" optional>
          <TextArea
            rows={5}
            value={v.responsibilities}
            onChange={set("responsibilities")}
          />
        </Field>
        <Field label="Required Qualifications" optional>
          <TextArea
            rows={4}
            value={v.qualifications}
            onChange={set("qualifications")}
          />
        </Field>
      </FormGrid>
    </FormSection>,

    // 4 — Pay, people, dates
    <div key="hiring" style={{ display: "grid", gap: 16 }}>
      <FormSection
        icon="banknote"
        title="Compensation"
        description="Optional. Leave both blank if you’d rather not set a range."
      >
        <FormGrid columns={2}>
          <Field label="Budget From (LPA)" optional>
            <TextInput
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              value={v.budgetMin}
              onChange={set("budgetMin")}
            />
          </Field>
          <Field label="Budget To (LPA)" optional error={errors.budgetMax}>
            <TextInput
              data-field="budgetMax"
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              value={v.budgetMax}
              onChange={set("budgetMax")}
            />
          </Field>
          <label className={`${inlineCheckClass} ${fieldSpan2}`}>
            <Switch
              checked={v.budgetDisclosed}
              onChange={(budgetDisclosed) => patch({ budgetDisclosed })}
              label="Show the budget on the careers page"
            />
            Show the budget on the careers page
          </label>
        </FormGrid>
      </FormSection>
      <FormSection
        icon="people"
        title="Hiring Team"
        description="Who owns the opening and how candidates are interviewed."
      >
        <FormGrid columns={2}>
          <Field label="Hiring Manager" error={errors.hiringManager}>
            <Select
              data-field="hiringManager"
              value={v.hiringManager}
              onChange={set("hiringManager")}
            >
              <option value="">Choose…</option>
              {v.hiringManager && !managers.includes(v.hiringManager) && (
                <option>{v.hiringManager}</option>
              )}
              {managers.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Recruiter" optional>
            <Select value={v.recruiter} onChange={set("recruiter")}>
              <option value="">None</option>
              {v.recruiter && !managers.includes(v.recruiter) && (
                <option>{v.recruiter}</option>
              )}
              {managers.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Interview Pipeline" optional>
            <Select
              value={v.pipelineTemplateId}
              onChange={set("pipelineTemplateId")}
            >
              <option value="">Organisation default</option>
              {pipelineOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.isDefault ? `${t.name} (Default)` : t.name}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection
        icon="calendar"
        title="Dates"
        description="When the opening goes up, and the last day to apply."
      >
        <FormGrid columns={2}>
          <Field label="Posted On" error={errors.jobPostingDate}>
            <TextInput
              data-field="jobPostingDate"
              type="date"
              max={dayjs().format("YYYY-MM-DD")}
              value={v.jobPostingDate}
              onChange={set("jobPostingDate")}
            />
          </Field>
          <Field
            label="Apply By"
            error={errors.applicationDeadline}
            hint={
              v.applicationDeadline && !errors.applicationDeadline
                ? `Open for ${Math.max(0, dayjs(v.applicationDeadline).diff(dayjs().startOf("day"), "day"))} more days`
                : undefined
            }
          >
            <TextInput
              data-field="applicationDeadline"
              type="date"
              min={id ? v.jobPostingDate : dayjs().format("YYYY-MM-DD")}
              value={v.applicationDeadline}
              onChange={set("applicationDeadline")}
            />
          </Field>
        </FormGrid>
      </FormSection>
    </div>,

    // 5 — Application form
    <div key="form" style={{ display: "grid", gap: 16 }}>
      <FormSection
        icon="idcard"
        title="Application Form"
        description="Name, email and mobile are always asked. Choose what else candidates fill in."
      >
        <FormFieldsEditor
          value={v.applicationForm}
          onChange={(applicationForm) => patch({ applicationForm })}
        />
      </FormSection>
      <FormSection
        icon="help"
        title="Screening Questions"
        description="Shown only for this opening, before the candidate reviews and submits."
      >
        <div data-field="screeningQuestions">
          <ScreeningQuestionsEditor
            value={v.screeningQuestions}
            onChange={(screeningQuestions) => patch({ screeningQuestions })}
            error={errors.screeningQuestions}
          />
        </div>
      </FormSection>
    </div>,

    // 6 — Review
    <div key="review" style={{ display: "grid", gap: 16 }}>
      {Object.keys(problems).length ? (
        <Banner
          tone="warning"
          title={`${Object.keys(problems).length} thing${Object.keys(problems).length === 1 ? "" : "s"} to fix before publishing`}
        >
          They’re listed under each section. Use Edit to go back to it.
        </Banner>
      ) : (
        <Banner tone="success" title="Ready to publish">
          {v.visibility === "internal"
            ? "Employees will see it as soon as it’s published."
            : "It goes live on your careers page as soon as it’s published."}
        </Banner>
      )}
      <ReviewSection
        title="Role"
        icon="briefcase"
        onEdit={() => wizard.go(0)}
        issues={issuesFor(0)}
        items={[
          ["Job Title", v.jobTitle],
          ["Department", v.department],
          ["Openings", v.numberOfVacancies],
          ["Employment Type", employmentTypeLabel(v.employmentType)],
          [
            "Who Can See It",
            VISIBILITIES.find(([k]) => k === v.visibility)?.[1],
          ],
        ]}
      />
      <ReviewSection
        title="Workplace"
        icon="pin"
        onEdit={() => wizard.go(1)}
        issues={issuesFor(1)}
        items={[
          ["Workplace Type", workplaceTypeLabel(v.workplaceType)],
          v.workplaceType === "remote"
            ? [
                "Can Work From",
                v.remoteScope === "anywhere"
                  ? "Anywhere"
                  : csv(v.remoteRegions).join(", "),
              ]
            : [
                v.locations.length > 1 ? "Locations" : "Location",
                v.locations
                  .map((l) =>
                    [l.office, l.city, l.state, l.country]
                      .filter((x) => x?.trim())
                      .join(", "),
                  )
                  .filter(Boolean)
                  .join(" · "),
              ],
        ]}
      />
      <ReviewSection
        title="Experience and Skills"
        icon="checklist"
        onEdit={() => wizard.go(2)}
        issues={issuesFor(2)}
        items={[
          [
            "Experience",
            v.experience.trim()
              ? `${v.experience}${v.experienceMax.trim() ? `–${v.experienceMax}` : "+"} years`
              : "",
          ],
          ["Required Skills", csv(v.requiredSkills).join(", ")],
          ["Preferred Skills", csv(v.preferredSkills).join(", ")],
          ["Minimum Qualification", v.minQualification],
        ]}
      />
      <ReviewSection
        title="Description"
        icon="doc"
        onEdit={() => wizard.go(3)}
        issues={issuesFor(3)}
        items={[
          ["About the Role", excerpt(v.jobDescription.trim())],
          ["Responsibilities", excerpt(v.responsibilities.trim())],
          ["Required Qualifications", excerpt(v.qualifications.trim())],
        ]}
      />
      <ReviewSection
        title="Pay, Team and Dates"
        icon="banknote"
        onEdit={() => wizard.go(4)}
        issues={issuesFor(4)}
        items={[
          ["Budget", budgetText],
          ["Hiring Manager", v.hiringManager],
          ["Recruiter", v.recruiter || "None"],
          [
            "Interview Pipeline",
            pipelineOptions.find((t) => t.id === v.pipelineTemplateId)?.name ??
              "Organisation default",
          ],
          ["Posted On", v.jobPostingDate ? fmtDate(v.jobPostingDate) : ""],
          [
            "Apply By",
            v.applicationDeadline ? fmtDate(v.applicationDeadline) : "",
          ],
        ]}
      />
      <ReviewSection
        title="Application"
        icon="idcard"
        onEdit={() => wizard.go(5)}
        issues={issuesFor(5)}
        items={[
          ["Profile Questions", `Name, email, mobile + ${fieldsAsked} more`],
          [
            "Résumé",
            v.applicationForm.resume === "required" ? "Required" : "Optional",
          ],
          [
            "Cover Letter",
            v.applicationForm.coverLetter === "hidden"
              ? "Not asked"
              : v.applicationForm.coverLetter === "required"
                ? "Required"
                : "Optional",
          ],
          [
            "Screening Questions",
            v.screeningQuestions.length
              ? `${v.screeningQuestions.length} (${v.screeningQuestions.filter((q) => q.required).length} required)`
              : "None",
          ],
        ]}
      />
    </div>,
  ];

  return (
    <Page
      title={id ? "Edit Opening" : "New Opening"}
      width="wide"
      description={
        created
          ? undefined
          : id
            ? "Changes apply as soon as you save. Candidates who already applied keep their answers."
            : "Six short steps, then a review. Nothing is published until you press Publish Opening."
      }
      back={
        id
          ? { to: `/view-job-opening/${id}`, label: "Opening" }
          : { to: "/job-openings/view-job-openings", label: "Job Openings" }
      }
    >
      {id && existing.loading ? (
        <SectionsSkeleton sections={4} fields={6} toggles={0} />
      ) : created ? (
        <Card>
          <EmptyState
            icon="checkCircle"
            tone="success"
            title={`${v.jobTitle.trim() || "The opening"} is live`}
            action={
              <div style={{ display: "grid", gap: 16, justifyItems: "center" }}>
                {applyLink && v.visibility !== "internal" && (
                  <div style={{ width: "min(100%, 460px)", textAlign: "left" }}>
                    <Field
                      label="Application Link"
                      hint="Share this with candidates."
                    >
                      <TextInput
                        readOnly
                        value={applyLink}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    </Field>
                  </div>
                )}
                <div className="px-row" style={{ justifyContent: "center" }}>
                  {applyLink && v.visibility !== "internal" && (
                    <Button
                      icon="link"
                      onClick={() => {
                        navigator.clipboard?.writeText(applyLink);
                        setAlert({
                          open: true,
                          message: "Link copied.",
                          severity: "success",
                        });
                      }}
                    >
                      Copy Link
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/view-job-opening/${created}`)}
                  >
                    View Opening
                  </Button>
                </div>
              </div>
            }
          >
            {v.visibility === "internal"
              ? "Employees can see it and apply now."
              : "It’s on your careers page and open for applications."}
          </EmptyState>
        </Card>
      ) : (
        <form id="job-form" onSubmit={submit} noValidate>
          <WizardLayout
            stepper={
              <Stepper
                label="Opening steps"
                steps={STEPS}
                current={wizard.current}
                reached={wizard.reached}
                onSelect={wizard.go}
                flagged={flagged}
                complete={STEPS.map((_, i) => i).filter(
                  (i) => i !== REVIEW && issuesFor(i).length === 0,
                )}
              />
            }
          >
            <StepHeader
              index={wizard.current}
              count={STEPS.length}
              title={STEPS[wizard.current].title}
              description={STEPS[wizard.current].description}
            />
            {steps[wizard.current]}
            <WizardFooter
              isFirst={wizard.isFirst}
              isLast={wizard.isLast}
              onBack={wizard.back}
              onContinue={onContinue}
              continueLabel={
                wizard.current === REVIEW - 1 ? "Review" : "Continue"
              }
              finishLabel={id ? "Save Changes" : "Publish Opening"}
              formId="job-form"
              busy={saving}
              leading={
                <Button variant="plain" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
              }
            />
          </WizardLayout>
        </form>
      )}
    </Page>
  );
}
