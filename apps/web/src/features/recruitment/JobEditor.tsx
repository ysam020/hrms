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
import { jobOpeningSchema } from "@web/shared/schemas/jobOpening";
import useJobTitleOptions from "@web/features/job-openings/useJobTitleOptions";
import { useTransitionNavigate } from "@next/motion";
import {
  Banner,
  Button,
  Field,
  FormGrid,
  Page,
  Select,
  Skeleton,
  TextArea,
  TextInput,
  fieldSpan2,
  SectionsSkeleton,
} from "@next/ui";
import { apiClient, asList, errorMessage, unwrap } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { personName } from "@next/lib/format";

// New / edit job opening. Same payload, schema (jobOpeningSchema), designation
// list (Classic's useJobTitleOptions), and pipeline templates as Classic's
// NewJobOpening / EditJobOpeningModal. Budget is in LPA, as in Classic.

type V = {
  jobTitle: string;
  numberOfVacancies: string;
  jobPostingDate: string;
  applicationDeadline: string;
  jobDescription: string;
  requiredSkills: string;
  experience: string;
  budgetMin: string;
  budgetMax: string;
  hiringManager: string;
  pipelineTemplateId: string;
};

const EMPTY: V = {
  jobTitle: "",
  numberOfVacancies: "1",
  jobPostingDate: dayjs().format("YYYY-MM-DD"),
  applicationDeadline: "",
  jobDescription: "",
  requiredSkills: "",
  experience: "",
  budgetMin: "",
  budgetMax: "",
  hiringManager: "",
  pipelineTemplateId: "",
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

  useEffect(() => {
    const j = existing.data;
    if (!j || j.message) return;
    setV({
      jobTitle: j.jobTitle ?? "",
      numberOfVacancies: String(j.numberOfVacancies ?? 1),
      jobPostingDate: (j.jobPostingDate ?? "").slice(0, 10),
      applicationDeadline: (j.applicationDeadline ?? "").slice(0, 10),
      jobDescription: j.jobDescription ?? "",
      requiredSkills: Array.isArray(j.requiredSkills)
        ? j.requiredSkills.join(", ")
        : (j.requiredSkills ?? ""),
      experience: j.experience ?? "",
      budgetMin: String(Array.isArray(j.budget) ? j.budget[0] : ""),
      budgetMax: String(Array.isArray(j.budget) ? j.budget[1] : ""),
      hiringManager: j.hiringManager ?? "",
      pipelineTemplateId: j.pipelineTemplateId ?? "",
    });
  }, [existing.data]);

  // Classic stores the hiring manager as an uppercase display name.
  const managers = useMemo(
    () =>
      asList<any>(people.data, "users")
        .map((u) =>
          personName({
            ...u,
            first_name: u.firstName ?? u.first_name,
            last_name: u.lastName ?? u.last_name,
          }).toUpperCase(),
        )
        .filter(Boolean)
        .sort(),
    [people.data],
  );
  const pipelineOptions = asList<any>(templates.data).filter((t) => t.isActive);
  const set = (k: keyof V) => (e: { target: { value: string } }) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: "" }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      jobTitle: v.jobTitle,
      numberOfVacancies: v.numberOfVacancies,
      jobPostingDate: v.jobPostingDate,
      applicationDeadline: v.applicationDeadline,
      jobDescription: v.jobDescription,
      requiredSkills: v.requiredSkills,
      experience: v.experience,
      budget: [Number(v.budgetMin) || 0, Number(v.budgetMax) || 0] as [
        number,
        number,
      ],
      hiringManager: v.hiringManager,
      pipelineTemplateId: v.pipelineTemplateId || undefined,
    };
    const parsed = jobOpeningSchema.safeParse(payload);
    if (!parsed.success) {
      const n: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const key =
          String(i.path[0]) === "budget" ? "budgetMax" : String(i.path[0]);
        n[key] ??= i.message;
      }
      setErrors(n);
      return;
    }
    setSaving(true);
    try {
      void ensureJobTitleSaved(v.jobTitle);
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
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const applyLink =
    created && user?.tenantSlug
      ? `${window.location.origin}/careers/${user.tenantSlug}/apply/${created}`
      : null;

  return (
    <Page
      title={id ? "Edit Opening" : "New Opening"}
      width="reading"
      back={
        id
          ? { to: `/view-job-opening/${id}`, label: "Opening" }
          : { to: "/job-openings/view-job-openings", label: "Job Openings" }
      }
    >
      {id && existing.loading ? (
        <SectionsSkeleton sections={2} fields={6} toggles={0} />
      ) : created ? (
        <div style={{ display: "grid", gap: 16, justifyItems: "start" }}>
          <Banner tone="success">The opening is live.</Banner>
          {applyLink && (
            <Field label="Application link" hint="Share this with candidates.">
              <TextInput
                readOnly
                value={applyLink}
                onFocus={(e) => e.currentTarget.select()}
              />
            </Field>
          )}
          <div className="px-row">
            {applyLink && (
              <Button onClick={() => navigator.clipboard?.writeText(applyLink)}>
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
      ) : (
        <form onSubmit={submit} noValidate style={{ display: "grid", gap: 24 }}>
          <FormGrid columns={2}>
            <Field
              label="Job Title"
              error={errors.jobTitle}
              className={fieldSpan2}
            >
              <TextInput
                data-autofocus
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
            <Field label="Openings" error={errors.numberOfVacancies}>
              <TextInput
                type="number"
                min={1}
                inputMode="numeric"
                value={v.numberOfVacancies}
                onChange={set("numberOfVacancies")}
              />
            </Field>
            <Field
              label="Experience"
              error={errors.experience}
              hint="e.g. 3–5 years"
            >
              <TextInput value={v.experience} onChange={set("experience")} />
            </Field>
            <Field label="Posted On" error={errors.jobPostingDate}>
              <TextInput
                type="date"
                max={dayjs().format("YYYY-MM-DD")}
                value={v.jobPostingDate}
                onChange={set("jobPostingDate")}
              />
            </Field>
            <Field label="Apply By" error={errors.applicationDeadline}>
              <TextInput
                type="date"
                min={v.jobPostingDate}
                value={v.applicationDeadline}
                onChange={set("applicationDeadline")}
              />
            </Field>
            <Field label="Budget From (LPA)">
              <TextInput
                type="number"
                min={0}
                step={0.5}
                inputMode="decimal"
                value={v.budgetMin}
                onChange={set("budgetMin")}
              />
            </Field>
            <Field label="Budget To (LPA)" error={errors.budgetMax}>
              <TextInput
                type="number"
                min={0}
                step={0.5}
                inputMode="decimal"
                value={v.budgetMax}
                onChange={set("budgetMax")}
              />
            </Field>
            <Field label="Hiring Manager" error={errors.hiringManager}>
              <Select value={v.hiringManager} onChange={set("hiringManager")}>
                <option value="">Choose…</option>
                {v.hiringManager && !managers.includes(v.hiringManager) && (
                  <option>{v.hiringManager}</option>
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
            <Field
              label="Required Skills"
              error={errors.requiredSkills}
              hint="Separate with commas"
              className={fieldSpan2}
            >
              <TextInput
                value={v.requiredSkills}
                onChange={set("requiredSkills")}
              />
            </Field>
            <Field
              label="Description"
              error={errors.jobDescription}
              className={fieldSpan2}
            >
              <TextArea
                rows={8}
                value={v.jobDescription}
                onChange={set("jobDescription")}
              />
            </Field>
          </FormGrid>
          <div className="px-row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" variant="primary" busy={saving}>
              {id ? "Save Changes" : "Publish Opening"}
            </Button>
          </div>
        </form>
      )}
    </Page>
  );
}
