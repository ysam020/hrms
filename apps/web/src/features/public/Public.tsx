import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { z } from "zod";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { Swap } from "@next/motion";
import {
  Banner,
  Button,
  Field,
  FormGrid,
  Icon,
  SearchField,
  Skeleton,
  Spinner,
  Tag,
  TextInput,
  fieldSpan2,
  ListSkeleton,
  ArticleSkeleton,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import s from "./public.module.css";

// Public careers pages (Classic's pages/CareersPage + JobApplicationPage) and
// the legal pages. Endpoints, the applicant schema and the public résumé
// upload checks are Classic's. The legal prose is Classic's own components,
// rendered in LegalLayout via the vite.config.ts import swap.

export { default as PrivacyPolicyPage } from "@web/pages/legal/PrivacyPolicyPage";
export { default as TermsPage } from "@web/pages/legal/TermsOfUsePage";
export { default as RefundPolicyPage } from "@web/pages/legal/RefundPolicyPage";

const budgetRange = (b?: number[]) =>
  b?.[0] && b?.[1] ? `₹${b[0]}–${b[1]} LPA` : null;
const deadline = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

function JobFacts({ job }: { job: any }) {
  const facts = [
    job.numberOfVacancies
      ? `${job.numberOfVacancies} ${job.numberOfVacancies === 1 ? "opening" : "openings"}`
      : null,
    job.experience != null ? `${job.experience}+ years` : null,
    budgetRange(job.budget),
    deadline(job.applicationDeadline) &&
      `Apply by ${deadline(job.applicationDeadline)}`,
  ].filter(Boolean) as string[];
  return (
    <ul className="px-row" style={{ gap: 6 }}>
      {facts.map((f) => (
        <li key={f}>
          <Tag>{f}</Tag>
        </li>
      ))}
    </ul>
  );
}

function PublicBar({ slug, title }: { slug?: string; title: string }) {
  useEffect(() => {
    document.title = `${title} · Praesto`;
  }, [title]);
  return (
    <header className={s.publicBar}>
      {slug ? (
        <Link to={`/careers/${slug}`} viewTransition className={s.brand}>
          <span className={s.glyph}>P</span> Careers
        </Link>
      ) : (
        <span className={s.brand}>
          <span className={s.glyph}>P</span> Careers
        </span>
      )}
    </header>
  );
}

// ── Careers ─────────────────────────────────────────────────────────────────

export function CareersPage() {
  const { slug } = useParams();
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!slug) return setJobs([]);
    apiClient
      .get(API_ENDPOINTS.GET_ALL_JOB_OPENINGS(slug), {
        params: { status: "Active" },
      })
      .then((res) => setJobs(asList(res.data?.data ?? res.data)))
      .catch(() => setJobs([]));
  }, [slug]);

  const q = query.trim().toLowerCase();
  const shown = (jobs ?? []).filter(
    (j) =>
      !q ||
      j.jobTitle?.toLowerCase().includes(q) ||
      j.requiredSkills?.toLowerCase().includes(q),
  );

  return (
    <div className={s.publicPage}>
      <PublicBar slug={slug} title="Careers" />
      <main className={s.careers}>
        <header className={s.hero}>
          <h1 className="px-display">Join Our Team</h1>
          <p className="px-secondary">
            Find a role that fits, and apply in a couple of minutes.
          </p>
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            label="Search by title or skill"
          />
        </header>
        {jobs === null ? (
          <ListSkeleton rows={3} trailing />
        ) : shown.length === 0 ? (
          <div className={s.emptyPublic}>
            <Icon name="briefcase" size={40} />
            <p className="px-headline">
              {q ? "No matching roles" : "No open roles right now"}
            </p>
            <p className="px-meta">
              {q ? "Try a different title or skill." : "Check back soon."}
            </p>
          </div>
        ) : (
          <ul className={s.jobs}>
            {shown.map((job) => {
              const id = job._id || job.id;
              return (
                <li key={id}>
                  <Link
                    to={`/careers/${slug}/apply/${id}`}
                    viewTransition
                    className={s.job}
                  >
                    <div className={s.jobHead}>
                      <div style={{ minWidth: 0 }}>
                        <h2 className="px-section">{job.jobTitle}</h2>
                        {job.hiringManager && (
                          <p className="px-meta">
                            Hiring manager: {job.hiringManager}
                          </p>
                        )}
                      </div>
                      <span className={s.applyCue}>
                        Apply <Icon name="chevronRight" size={16} />
                      </span>
                    </div>
                    <JobFacts job={job} />
                    {job.jobDescription && (
                      <p className={s.clamp}>{job.jobDescription}</p>
                    )}
                    {job.requiredSkills && (
                      <p className="px-meta">Skills: {job.requiredSkills}</p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

// ── Application ─────────────────────────────────────────────────────────────

const applicantSchema = z.object({
  name: z
    .string()
    .min(2, "Enter at least 2 characters.")
    .max(50, "Use 50 characters or fewer."),
  mobile: z.string().regex(/^[0-9]{10}$/, "Enter a 10-digit mobile number."),
  email: z.string().email("Enter a valid email address."),
  aadharNo: z
    .string()
    .regex(/^[0-9]{12}$/, "Enter the 12-digit Aadhaar number."),
  jobTitle: z.string().min(1, "Choose a role."),
  resume: z.string().min(1, "Attach your résumé."),
});
type Applicant = z.infer<typeof applicantSchema>;
const MAX_RESUME = 5 * 1024 * 1024;

export function JobApplicationPage() {
  const { slug, id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<any | null | undefined>(undefined);
  const [jobError, setJobError] = useState("");
  const [values, setValues] = useState<Applicant>({
    name: "",
    mobile: "",
    email: "",
    aadharNo: "",
    jobTitle: id ?? "",
    resume: "",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof Applicant, string>>
  >({});
  const [resumeName, setResumeName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!slug || !id) return setJob(null);
    apiClient
      .get(API_ENDPOINTS.GET_PUBLIC_JOB_OPENING(slug, id))
      .then((res) => setJob(res.data?.data ?? null))
      .catch((err) => {
        setJob(null);
        setJobError(
          err.response?.data?.message ?? "This opening couldn’t be found.",
        );
      });
  }, [slug, id]);

  const set = (k: keyof Applicant) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  // Classic's checks: `accept` is only a hint, so type and size are enforced
  // here before anything is sent to the public upload endpoint.
  const pickResume = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reject = (msg: string) => {
      setErrors((x) => ({ ...x, resume: msg }));
      e.target.value = "";
    };
    if (!slug) return reject("This careers link isn’t valid.");
    if (file.type !== "application/pdf") return reject("Attach a PDF.");
    if (file.size > MAX_RESUME)
      return reject("Attach a PDF smaller than 5 MB.");
    setErrors((x) => ({ ...x, resume: undefined }));
    setResumeName(file.name);
    setUploading(true);
    try {
      const { data } = await apiClient.post(
        API_ENDPOINTS.RESUME_UPLOAD_URL(slug),
        { fileName: file.name, fileType: file.type },
      );
      const { url, fileUrl } = data.data;
      await axios.put(url, file, { headers: { "Content-Type": file.type } });
      setValues((v) => ({ ...v, resume: fileUrl }));
    } catch {
      setResumeName("");
      reject("That file couldn’t be uploaded. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = applicantSchema.safeParse(values);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues)
        next[issue.path[0] as keyof Applicant] ??= issue.message;
      setErrors(next);
      document.getElementById(`apply-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    if (!slug) return setServerError("This careers link isn’t valid.");
    setServerError("");
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.APPLY_FOR_JOB(slug), parsed.data);
      setSubmitted(true);
    } catch (err) {
      setServerError(
        errorMessage(err, "Your application couldn’t be sent. Try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={s.publicPage}>
      <PublicBar
        slug={slug}
        title={job?.jobTitle ? `Apply · ${job.jobTitle}` : "Apply"}
      />
      <Swap id={submitted ? "done" : "form"}>
        {submitted ? (
          <main className={s.done}>
            <Icon name="check" size={44} className={s.check} />
            <h1 className="px-title">Application Sent</h1>
            <p className="px-secondary">
              Thanks for applying. The team will review it and get back to you.
            </p>
            <Button
              onClick={() =>
                navigate(`/careers/${slug}`, {
                  replace: true,
                  viewTransition: true,
                })
              }
            >
              See More Openings
            </Button>
          </main>
        ) : (
          <main className={s.apply}>
            <section className={s.jobCol} aria-label="About the role">
              {job === undefined ? (
                <ArticleSkeleton paragraphs={2} />
              ) : job ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <h1 className="px-title">{job.jobTitle}</h1>
                  {job.hiringManager && (
                    <p className="px-meta">
                      Hiring manager: {job.hiringManager}
                    </p>
                  )}
                  <JobFacts job={job} />
                  {job.jobDescription && (
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {job.jobDescription}
                    </p>
                  )}
                  {job.requiredSkills && (
                    <p className="px-meta">Skills: {job.requiredSkills}</p>
                  )}
                </div>
              ) : (
                <Banner tone="warning">
                  {jobError || "This opening couldn’t be found."}
                </Banner>
              )}
            </section>
            <form
              className={s.formCol}
              onSubmit={submit}
              noValidate
              aria-label="Application"
            >
              <h2 className="px-section">Your Details</h2>
              {serverError && <Banner tone="danger">{serverError}</Banner>}
              <FormGrid columns={2}>
                <Field
                  label="Full Name"
                  error={errors.name}
                  className={fieldSpan2}
                >
                  <TextInput
                    id="apply-name"
                    autoComplete="name"
                    value={values.name}
                    onChange={set("name")}
                  />
                </Field>
                <Field label="Mobile" error={errors.mobile}>
                  <TextInput
                    id="apply-mobile"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    autoComplete="tel-national"
                    value={values.mobile}
                    onChange={set("mobile")}
                  />
                </Field>
                <Field label="Email" error={errors.email}>
                  <TextInput
                    id="apply-email"
                    type="email"
                    autoComplete="email"
                    value={values.email}
                    onChange={set("email")}
                  />
                </Field>
                <Field
                  label="Aadhaar Number"
                  error={errors.aadharNo}
                  className={fieldSpan2}
                >
                  <TextInput
                    id="apply-aadharNo"
                    inputMode="numeric"
                    maxLength={12}
                    value={values.aadharNo}
                    onChange={set("aadharNo")}
                  />
                </Field>
                <Field
                  label="Résumé"
                  hint="PDF, up to 5 MB"
                  error={errors.resume}
                  className={fieldSpan2}
                >
                  <label
                    className={s.resume}
                    data-filled={resumeName || undefined}
                  >
                    <input
                      id="apply-resume"
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={pickResume}
                      className="px-sr-only"
                    />
                    {uploading ? (
                      <Spinner label="Uploading" />
                    ) : (
                      <Icon name={resumeName ? "doc" : "upload"} />
                    )}
                    <span className="px-truncate">
                      {uploading ? "Uploading…" : resumeName || "Choose a PDF"}
                    </span>
                  </label>
                </Field>
              </FormGrid>
              <Button
                type="submit"
                variant="primary"
                size="large"
                busy={submitting}
                disabled={uploading || !job}
              >
                Submit Application
              </Button>
            </form>
          </main>
        )}
      </Swap>
    </div>
  );
}
