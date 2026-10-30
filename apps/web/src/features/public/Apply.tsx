import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { Swap } from "@next/motion";
import {
  ArticleSkeleton,
  Banner,
  Button,
  Checkbox,
  Dialog,
  Field,
  FormGrid,
  Icon,
  Select,
  Spinner,
  TextArea,
  TextInput,
  fieldSpan2,
  inlineCheckClass,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import {
  jobConfig,
  type ProfileField,
  type ScreeningQuestion,
} from "@next/features/recruitment/jobConfig";
import {
  buildSteps,
  clearLocal,
  emptyAnswers,
  readLocal,
  reconcile,
  stepOfField,
  validateAll,
  validateStep,
  writeLocal,
  type Answers,
  type Errors,
  type LocalDraft,
} from "./applyForm";
import { JobFacts, JobLocationLine, PublicBar } from "./jobDisplay";
import s from "./public.module.css";

// The public, multi-step application. Answers live in one object for the
// whole form, so moving between steps never loses anything. Once name, email
// and mobile are in, a draft is created on the server and autosaved
// (debounced, one request at a time, revision-checked); this browser keeps a
// copy too, so a refresh or dropped connection loses nothing. Another device
// continues the draft with a code emailed to the candidate.

const MAX_RESUME = 5 * 1024 * 1024;
const AUTOSAVE_MS = 1500;

type SaveState =
  | "idle"
  | "saving"
  | "saved"
  | "local" // only in this browser: the server save failed
  | "unstored" // neither: browser storage is unavailable too
  | "conflict"
  | "lost"; // this device's access to the draft is gone

type Conflict = { revision: number; data: Answers };

const tokenHeader = (token?: string) =>
  token ? { headers: { "X-Draft-Token": token } } : {};

const status = (err: any) => err?.response?.status as number | undefined;
const code = (err: any) => err?.response?.data?.code as string | undefined;

export function JobApplicationPage() {
  const { slug = "", id: jobId = "" } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<any | null | undefined>(undefined);
  const [jobError, setJobError] = useState("");

  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [recoverOpen, setRecoverOpen] = useState(false);

  // Draft handle and save bookkeeping live in refs: autosave reads the latest
  // values without re-subscribing, and only one save is ever in flight.
  const draft = useRef<{ id?: string; token?: string; revision: number }>({
    revision: 0,
  });
  const latest = useRef(answers);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const steps = useMemo(() => (job ? buildSteps(job) : []), [job]);
  const form = useMemo(() => jobConfig(job).form, [job]);
  const step = steps[stepIndex];
  const isReview = step?.key === "review";

  const remember = useCallback(
    (a: Answers, isDirty: boolean) => {
      const local: LocalDraft = {
        draftId: draft.current.id,
        token: draft.current.token,
        baseRevision: draft.current.revision,
        dirty: isDirty,
        savedAt: Date.now(),
        answers: a,
      };
      return writeLocal(slug, jobId, local);
    },
    [slug, jobId],
  );

  // ── Load the opening, then whatever this browser had saved ──────────────
  useEffect(() => {
    if (!slug || !jobId) return setJob(null);
    let cancelled = false;
    apiClient
      .get(API_ENDPOINTS.GET_PUBLIC_JOB_OPENING(slug, jobId))
      .then(async (res) => {
        if (cancelled) return;
        const j = res.data?.data ?? null;
        setJob(j);
        const local = readLocal(slug, jobId);
        if (!local) return;
        draft.current = {
          id: local.draftId,
          token: local.token,
          revision: local.baseRevision,
        };
        if (!local.draftId) {
          // Answers typed before a draft existed (e.g. offline on step one).
          setAnswers(local.answers);
          latest.current = local.answers;
          setRestored(true);
          return;
        }
        try {
          const r = await apiClient.get(
            API_ENDPOINTS.PUBLIC_DRAFT(slug, local.draftId),
            tokenHeader(local.token),
          );
          if (cancelled) return;
          const server = r.data?.data;
          if (server?.status === "submitted") {
            clearLocal(slug, jobId);
            setSubmitted(true);
            return;
          }
          const choice = reconcile(local, server);
          const use = choice === "server" ? server.data : local.answers;
          draft.current.revision = server.revision;
          setAnswers({ ...emptyAnswers(), ...use });
          latest.current = { ...emptyAnswers(), ...use };
          setRestored(true);
          if (choice === "ask") {
            // Keep showing this device's answers; let the candidate pick.
            draft.current.revision = local.baseRevision;
            setConflict({ revision: server.revision, data: server.data });
            setSaveState("conflict");
          } else if (choice === "local") {
            dirty.current = true;
            scheduleSave(0);
          } else {
            setSaveState("saved");
          }
        } catch (err) {
          if (cancelled) return;
          // Server unreachable: carry on from this browser's copy.
          setAnswers(local.answers);
          latest.current = local.answers;
          setRestored(true);
          if (status(err) === 404) {
            draft.current = { revision: 0 };
            setSaveState("lost");
          } else {
            dirty.current = local.dirty;
            setSaveState(local.dirty ? "local" : "idle");
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setJob(null);
        setJobError(
          err.response?.data?.message ?? "This opening couldn’t be found.",
        );
      });
    return () => {
      cancelled = true;
    };
    // scheduleSave is stable for a given slug/job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, jobId]);

  // ── Saving ───────────────────────────────────────────────────────────────
  const saveNow = useCallback(async (): Promise<void> => {
    if (!draft.current.id || !dirty.current) return;
    if (inFlight.current) {
      // One request at a time; whatever changed meanwhile goes next.
      await inFlight.current;
      return saveNow();
    }
    const body = { revision: draft.current.revision, data: latest.current };
    const sent = latest.current;
    setSaveState("saving");
    const run = (async () => {
      try {
        const r = await apiClient.put(
          API_ENDPOINTS.PUBLIC_DRAFT(slug, draft.current.id!),
          body,
          tokenHeader(draft.current.token),
        );
        draft.current.revision = r.data?.data?.revision ?? body.revision + 1;
        if (latest.current === sent) dirty.current = false;
        remember(latest.current, dirty.current);
        setSaveState(dirty.current ? "saving" : "saved");
      } catch (err) {
        if (status(err) === 409 && code(err) === "STALE") {
          const server = err.response.data.data;
          setConflict({ revision: server.revision, data: server.data });
          setSaveState("conflict");
        } else if (status(err) === 409 && code(err) === "SUBMITTED") {
          clearLocal(slug, jobId);
          setSubmitted(true);
        } else if (status(err) === 404 && code(err) === "NO_ACCESS") {
          draft.current = { revision: 0 };
          setSaveState("lost");
        } else {
          setSaveState(remember(latest.current, true) ? "local" : "unstored");
        }
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    await run;
    if (dirty.current && latest.current !== sent && !conflictRef.current)
      return saveNow();
  }, [slug, jobId, remember]);

  const conflictRef = useRef<Conflict | null>(null);
  conflictRef.current = conflict;

  const scheduleSave = useCallback(
    (delay = AUTOSAVE_MS) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!conflictRef.current) void saveNow();
      }, delay);
    },
    [saveNow],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;

  // Every edit goes through here: the browser copy is written at once, the
  // server save is debounced.
  const update = (fn: (a: Answers) => Answers, touched: string[] = []) => {
    const next = fn(latest.current);
    latest.current = next;
    dirty.current = true;
    setAnswers(next);
    const stored = remember(next, true);
    if (draft.current.id && saveStateRef.current !== "lost") scheduleSave();
    else if (!stored) setSaveState("unstored");
    if (touched.some((k) => errors[k]))
      setErrors((e) => {
        const n = { ...e };
        touched.forEach((k) => delete n[k]);
        return n;
      });
  };

  const setTop =
    (k: "name" | "email" | "mobile" | "coverLetter") =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      update((a) => ({ ...a, [k]: value }), [k]);
    };
  const setProfile = (k: string, v: string | number | boolean | "") =>
    update(
      (a) => {
        const profile = { ...a.profile };
        if (v === "") delete profile[k];
        else profile[k] = v;
        return { ...a, profile };
      },
      [k],
    );
  const setAnswer = (
    q: ScreeningQuestion,
    v: string | number | string[] | "",
  ) =>
    update(
      (a) => {
        const next = { ...a.answers };
        if (v === "" || (Array.isArray(v) && !v.length)) delete next[q.id!];
        else next[q.id!] = v;
        return { ...a, answers: next };
      },
      [`q:${q.id}`],
    );

  // ── Conflict choices ─────────────────────────────────────────────────────
  const useServerCopy = () => {
    if (!conflict) return;
    const data = { ...emptyAnswers(), ...conflict.data };
    draft.current.revision = conflict.revision;
    latest.current = data;
    dirty.current = false;
    setAnswers(data);
    remember(data, false);
    setConflict(null);
    setSaveState("saved");
  };
  const keepThisCopy = () => {
    if (!conflict) return;
    draft.current.revision = conflict.revision;
    dirty.current = true;
    setConflict(null);
    conflictRef.current = null;
    void saveNow();
  };

  // ── Navigation ───────────────────────────────────────────────────────────
  const go = (i: number) => {
    setStepIndex(i);
    setServerError("");
    requestAnimationFrame(() => {
      headingRef.current?.focus();
      headingRef.current?.scrollIntoView({ block: "nearest" });
    });
  };

  const focusFirstError = (e: Errors) => {
    const first = Object.keys(e)[0];
    if (first)
      requestAnimationFrame(() =>
        document.getElementById(`apply-${first.replace(":", "-")}`)?.focus(),
      );
  };

  const startDraft = async (): Promise<boolean> => {
    try {
      const r = await apiClient.post(API_ENDPOINTS.PUBLIC_DRAFTS(slug, jobId), {
        data: latest.current,
      });
      const d = r.data?.data;
      draft.current = { id: d.draftId, token: d.token, revision: d.revision };
      dirty.current = false;
      remember(latest.current, false);
      setSaveState("saved");
      return true;
    } catch (err) {
      if (code(err) === "DRAFT_EXISTS") {
        setRecoverOpen(true);
        return false;
      }
      if (code(err) === "ALREADY_APPLIED") {
        setServerError(errorMessage(err));
        return false;
      }
      if (status(err) === 400 && err?.response?.data?.errors) {
        setErrors(err.response.data.errors);
        return false;
      }
      if (status(err) === 404) {
        setServerError(errorMessage(err));
        return false;
      }
      // Offline or server trouble: keep going; this browser has the answers
      // and the draft is created on the next Continue.
      setSaveState(remember(latest.current, true) ? "local" : "unstored");
      return true;
    }
  };

  const next = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!step) return;
    const found = validateStep(step, latest.current, form);
    setErrors(found);
    if (Object.keys(found).length) return focusFirstError(found);
    setBusy(true);
    try {
      if (!draft.current.id) {
        if (!(await startDraft())) return;
      } else {
        clearTimeout(timer.current);
        await saveNow();
      }
      go(stepIndex + 1);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const problems = validateAll(steps, latest.current, form);
    if (problems.length) {
      setErrors(problems[0].errors);
      if (problems[0].step !== stepIndex) go(problems[0].step);
      focusFirstError(problems[0].errors);
      return;
    }
    if (busy) return;
    setBusy(true);
    setServerError("");
    try {
      if (!draft.current.id && !(await startDraft())) return;
      if (!draft.current.id)
        return setServerError(
          "Praesto can’t be reached right now. Your answers are kept on this device — try again in a moment.",
        );
      clearTimeout(timer.current);
      await saveNow();
      if (dirty.current || conflictRef.current)
        return setServerError(
          "Your latest answers haven’t been saved yet. Resolve the message above, then submit.",
        );
      await apiClient.post(
        API_ENDPOINTS.PUBLIC_DRAFT_SUBMIT(slug, draft.current.id),
        {},
        tokenHeader(draft.current.token),
      );
      clearLocal(slug, jobId);
      setSubmitted(true);
    } catch (err: any) {
      const fieldErrors = err?.response?.data?.errors as Errors | undefined;
      if (status(err) === 400 && fieldErrors) {
        setErrors(fieldErrors);
        const target = stepOfField(steps, Object.keys(fieldErrors)[0]);
        if (target !== stepIndex) go(target);
        focusFirstError(fieldErrors);
      } else if (code(err) === "IN_PROGRESS") {
        setServerError("Your application is being sent. This takes a moment.");
      } else {
        setServerError(
          errorMessage(err, "Your application couldn’t be sent. Try again."),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const startOver = async () => {
    if (draft.current.id) {
      try {
        await apiClient.delete(
          API_ENDPOINTS.PUBLIC_DRAFT(slug, draft.current.id),
          tokenHeader(draft.current.token),
        );
      } catch {
        /* the draft expires on its own */
      }
    }
    clearTimeout(timer.current);
    clearLocal(slug, jobId);
    draft.current = { revision: 0 };
    dirty.current = false;
    const blank = emptyAnswers();
    latest.current = blank;
    setAnswers(blank);
    setErrors({});
    setConflict(null);
    setRestored(false);
    setSaveState("idle");
    go(0);
  };

  const recovered = (d: any) => {
    draft.current = { id: d.draftId, token: d.token, revision: d.revision };
    const data = { ...emptyAnswers(), ...d.data };
    latest.current = data;
    dirty.current = false;
    setAnswers(data);
    remember(data, false);
    setConflict(null);
    setSaveState("saved");
    setRestored(true);
    setRecoverOpen(false);
    setErrors({});
    setServerError("");
  };

  // ── Résumé ───────────────────────────────────────────────────────────────
  // `accept` is only a hint, so type and size are checked here too; the
  // server checks the stored file again before accepting the application.
  const pickResume = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reject = (msg: string) => {
      setErrors((x) => ({ ...x, resume: msg }));
      e.target.value = "";
    };
    if (file.type !== "application/pdf") return reject("Attach a PDF.");
    if (file.size > MAX_RESUME)
      return reject("Attach a PDF smaller than 5 MB.");
    setErrors((x) => {
      const n = { ...x };
      delete n.resume;
      return n;
    });
    setUploading(true);
    try {
      const { data } = await apiClient.post(
        API_ENDPOINTS.RESUME_UPLOAD_URL(slug),
        {
          fileName: file.name,
          fileType: file.type,
        },
      );
      const { url, fileUrl } = data.data;
      await axios.put(url, file, { headers: { "Content-Type": file.type } });
      update(
        (a) => ({ ...a, resume: fileUrl, resumeName: file.name }),
        ["resume"],
      );
    } catch {
      reject(
        "That file couldn’t be uploaded. Check your connection and try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
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
                <JobSummary job={job} />
              ) : (
                <Banner tone="warning">
                  {jobError || "This opening couldn’t be found."}
                </Banner>
              )}
            </section>
            {job && step && (
              <form
                className={s.formCol}
                data-steps
                onSubmit={
                  isReview ? (e) => (e.preventDefault(), void submit()) : next
                }
                noValidate
                aria-label="Application"
              >
                <StepIndicator
                  steps={steps.map((x) => x.title)}
                  current={stepIndex}
                />
                <div className={s.stepHead}>
                  <h2 className="px-section" tabIndex={-1} ref={headingRef}>
                    {step.title}
                  </h2>
                  <SaveStatus
                    state={saveState}
                    onRetry={() => {
                      dirty.current = true;
                      void saveNow();
                    }}
                  />
                </div>

                {restored && stepIndex === 0 && !conflict && (
                  <Banner tone="accent">
                    We kept the answers you’d started.{" "}
                    <button
                      type="button"
                      className={s.linkButton}
                      onClick={startOver}
                    >
                      Start over
                    </button>
                  </Banner>
                )}
                {conflict && (
                  <Banner tone="warning">
                    <div style={{ display: "grid", gap: 8 }}>
                      <span>
                        This application was changed on another device after
                        this one last saved.
                      </span>
                      <div className="px-row">
                        <Button size="small" onClick={useServerCopy}>
                          Use the Other Device’s Answers
                        </Button>
                        <Button size="small" onClick={keepThisCopy}>
                          Keep This Device’s Answers
                        </Button>
                      </div>
                    </div>
                  </Banner>
                )}
                {saveState === "lost" && (
                  <Banner tone="warning">
                    This device can no longer save to your application. Your
                    answers are kept here.{" "}
                    <button
                      type="button"
                      className={s.linkButton}
                      onClick={() => setRecoverOpen(true)}
                    >
                      Verify your email to continue
                    </button>
                  </Banner>
                )}
                {serverError && <Banner tone="danger">{serverError}</Banner>}

                {isReview ? (
                  <Review
                    job={job}
                    steps={steps}
                    answers={answers}
                    onEdit={go}
                    consent={answers.consent}
                    consentError={errors.consent}
                    onConsent={(consent) =>
                      update((a) => ({ ...a, consent }), ["consent"])
                    }
                  />
                ) : (
                  <FormGrid columns={2}>
                    {step.key === "personal" && (
                      <>
                        <Field
                          label="Full Name"
                          error={errors.name}
                          className={fieldSpan2}
                        >
                          <TextInput
                            id="apply-name"
                            autoComplete="name"
                            maxLength={100}
                            value={answers.name}
                            onChange={setTop("name")}
                          />
                        </Field>
                        <Field label="Email" error={errors.email}>
                          <TextInput
                            id="apply-email"
                            type="email"
                            autoComplete="email"
                            maxLength={254}
                            value={answers.email}
                            onChange={setTop("email")}
                          />
                        </Field>
                        <Field
                          label="Mobile"
                          hint="Include the country code if outside India"
                          error={errors.mobile}
                        >
                          <TextInput
                            id="apply-mobile"
                            type="tel"
                            autoComplete="tel"
                            maxLength={20}
                            value={answers.mobile}
                            onChange={setTop("mobile")}
                          />
                        </Field>
                      </>
                    )}
                    {step.resume && (
                      <Field
                        label="Résumé"
                        optional={form.resume === "optional"}
                        hint="PDF, up to 5 MB"
                        error={errors.resume}
                        className={fieldSpan2}
                      >
                        <label
                          className={s.resume}
                          data-filled={answers.resumeName || undefined}
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
                            <Icon
                              name={answers.resumeName ? "doc" : "upload"}
                            />
                          )}
                          <span className="px-truncate">
                            {uploading
                              ? "Uploading…"
                              : answers.resumeName || "Choose a PDF"}
                          </span>
                        </label>
                      </Field>
                    )}
                    {step.fields.map((f) => (
                      <ProfileInput
                        key={f.key}
                        field={f}
                        optional={form.fields[f.key] === "optional"}
                        value={answers.profile[f.key]}
                        error={errors[f.key]}
                        onChange={(v) => setProfile(f.key, v)}
                      />
                    ))}
                    {step.questions?.map((q) => (
                      <QuestionInput
                        key={q.id}
                        question={q}
                        value={answers.answers[q.id!]}
                        error={errors[`q:${q.id}`]}
                        onChange={(v) => setAnswer(q, v)}
                      />
                    ))}
                    {step.coverLetter && (
                      <Field
                        label="Cover Letter"
                        optional={form.coverLetter === "optional"}
                        error={errors.coverLetter}
                        className={fieldSpan2}
                      >
                        <TextArea
                          id="apply-coverLetter"
                          rows={6}
                          maxLength={10000}
                          value={answers.coverLetter}
                          onChange={setTop("coverLetter")}
                        />
                      </Field>
                    )}
                  </FormGrid>
                )}

                <div className={s.stepActions}>
                  {stepIndex > 0 ? (
                    <Button onClick={() => go(stepIndex - 1)} disabled={busy}>
                      Back
                    </Button>
                  ) : (
                    <button
                      type="button"
                      className={s.linkButton}
                      onClick={() => setRecoverOpen(true)}
                    >
                      Continue on another device?
                    </button>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="large"
                    busy={busy}
                    disabled={uploading}
                  >
                    {isReview ? "Submit Application" : "Continue"}
                  </Button>
                </div>
              </form>
            )}
          </main>
        )}
      </Swap>
      <RecoverDialog
        open={recoverOpen}
        onClose={() => setRecoverOpen(false)}
        slug={slug}
        jobId={jobId}
        initialEmail={answers.email}
        onRecovered={recovered}
      />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function JobSummary({ job }: { job: any }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 className="px-title">{job.jobTitle}</h1>
      {job.department && <p className="px-meta">{job.department}</p>}
      <JobLocationLine job={job} />
      <JobFacts job={job} />
      {job.jobDescription && (
        <p style={{ whiteSpace: "pre-wrap" }}>{job.jobDescription}</p>
      )}
      {job.responsibilities && (
        <>
          <h2 className="px-headline">Responsibilities</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{job.responsibilities}</p>
        </>
      )}
      {(job.qualifications || job.minQualification) && (
        <>
          <h2 className="px-headline">Qualifications</h2>
          {job.minQualification && <p>Minimum: {job.minQualification}</p>}
          {job.qualifications && (
            <p style={{ whiteSpace: "pre-wrap" }}>{job.qualifications}</p>
          )}
        </>
      )}
      {job.requiredSkills && (
        <p className="px-meta">Skills: {job.requiredSkills}</p>
      )}
      {job.preferredSkills && (
        <p className="px-meta">Nice to have: {job.preferredSkills}</p>
      )}
    </div>
  );
}

function StepIndicator({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <nav aria-label="Application progress">
      <p className="px-meta" aria-hidden>
        Step {current + 1} of {steps.length}
      </p>
      <ol className={s.steps}>
        {steps.map((t, i) => (
          <li
            key={t}
            data-state={
              i < current ? "done" : i === current ? "current" : "todo"
            }
            aria-current={i === current ? "step" : undefined}
          >
            <span className="px-sr-only">
              {t}
              {i < current ? " (done)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SaveStatus({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => void;
}) {
  const text: Partial<Record<SaveState, ReactNode>> = {
    saving: "Saving…",
    saved: "Saved",
    local: (
      <>
        Couldn’t save. Kept on this device.{" "}
        <button type="button" onClick={onRetry} className={s.linkButton}>
          Retry
        </button>
      </>
    ),
    unstored: (
      <>
        Couldn’t save your changes.{" "}
        <button type="button" onClick={onRetry} className={s.linkButton}>
          Retry
        </button>
      </>
    ),
  };
  if (!text[state]) return null;
  return (
    <span className="px-meta" role="status" aria-live="polite">
      {text[state]}
    </span>
  );
}

function ProfileInput({
  field: f,
  optional,
  value,
  error,
  onChange,
}: {
  field: ProfileField;
  optional: boolean;
  value: unknown;
  error?: string;
  onChange: (v: string | number | boolean | "") => void;
}) {
  const id = `apply-${f.key}`;
  const numeric = f.type === "years" || f.type === "lpa" || f.type === "days";
  return (
    <Field label={f.label} optional={optional} hint={f.hint} error={error}>
      {f.type === "yesno" ? (
        <Select
          id={id}
          value={value === true ? "yes" : value === false ? "no" : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : e.target.value === "yes")
          }
        >
          <option value="">Choose…</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      ) : (
        <TextInput
          id={id}
          type={numeric ? "number" : f.type === "url" ? "url" : "text"}
          inputMode={numeric ? "decimal" : undefined}
          min={numeric ? 0 : undefined}
          step={f.type === "days" ? 1 : numeric ? 0.5 : undefined}
          autoComplete={f.autoComplete}
          maxLength={numeric ? undefined : f.type === "url" ? 300 : 200}
          value={value == null ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(numeric ? (raw === "" ? "" : Number(raw)) : raw);
          }}
        />
      )}
    </Field>
  );
}

function QuestionInput({
  question: q,
  value,
  error,
  onChange,
}: {
  question: ScreeningQuestion;
  value: unknown;
  error?: string;
  onChange: (v: string | number | string[] | "") => void;
}) {
  const id = `apply-q-${q.id}`;
  const common = {
    label: q.label,
    optional: !q.required,
    hint: q.helpText || undefined,
    error,
  };
  if (q.type === "multi_select") {
    const picked = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset
        className={`${s.choiceGroup} ${fieldSpan2}`}
        id={id}
        tabIndex={-1}
      >
        <legend className="px-label">
          {q.label}
          {!q.required && <span className="px-tertiary"> Optional</span>}
        </legend>
        {q.helpText && <p className="px-meta">{q.helpText}</p>}
        {q.options.map((o) => (
          <label key={o} className={inlineCheckClass}>
            <Checkbox
              checked={picked.includes(o)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...picked, o]
                    : picked.filter((x) => x !== o),
                )
              }
            />
            {o}
          </label>
        ))}
        {error && (
          <p
            className="px-meta"
            role="alert"
            style={{ color: "var(--px-danger)" }}
          >
            {error}
          </p>
        )}
      </fieldset>
    );
  }
  return (
    <Field {...common} className={fieldSpan2}>
      {q.type === "long_text" ? (
        <TextArea
          id={id}
          rows={4}
          maxLength={5000}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : q.type === "select" || q.type === "yes_no" ? (
        <Select
          id={id}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {(q.type === "yes_no" ? ["yes", "no"] : q.options).map((o) => (
            <option key={o} value={o}>
              {q.type === "yes_no" ? (o === "yes" ? "Yes" : "No") : o}
            </option>
          ))}
        </Select>
      ) : (
        <TextInput
          id={id}
          type={
            q.type === "number" ? "number" : q.type === "date" ? "date" : "text"
          }
          inputMode={q.type === "number" ? "decimal" : undefined}
          maxLength={q.type === "short_text" ? 500 : undefined}
          value={value == null ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(q.type === "number" && raw !== "" ? Number(raw) : raw);
          }}
        />
      )}
    </Field>
  );
}

const display = (v: unknown, type?: string): string => {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (type === "yes_no") return v === "yes" ? "Yes" : "No";
  if (type === "years") return `${v} years`;
  if (type === "lpa") return `₹${v} LPA`;
  if (type === "days") return `${v} days`;
  return String(v);
};

function Review({
  job,
  steps,
  answers: a,
  onEdit,
  consent,
  consentError,
  onConsent,
}: {
  job: any;
  steps: ReturnType<typeof buildSteps>;
  answers: Answers;
  onEdit: (i: number) => void;
  consent: boolean;
  consentError?: string;
  onConsent: (v: boolean) => void;
}) {
  const { form } = jobConfig(job);
  const problems = validateAll(steps.slice(0, -1), a, form);
  return (
    <div className={s.review}>
      <p className="px-secondary">
        Check your answers for <strong>{job.jobTitle}</strong> before you send
        them.
      </p>
      {problems.length > 0 && (
        <Banner tone="warning">
          Some answers still need attention — use Edit to fix them.
        </Banner>
      )}
      {steps.slice(0, -1).map((st, i) => {
        const rows: [string, string, string?][] = [];
        if (st.key === "personal")
          rows.push(
            ["Full name", a.name, "name"],
            ["Email", a.email, "email"],
            ["Mobile", a.mobile, "mobile"],
          );
        if (st.resume) rows.push(["Résumé", a.resumeName, "resume"]);
        st.fields.forEach((f) =>
          rows.push([f.label, display(a.profile[f.key], f.type), f.key]),
        );
        st.questions?.forEach((q) =>
          rows.push([q.label, display(a.answers[q.id!], q.type), `q:${q.id}`]),
        );
        if (st.coverLetter)
          rows.push(["Cover letter", a.coverLetter, "coverLetter"]);
        const errs = problems.find((p) => p.step === i)?.errors ?? {};
        return (
          <section key={st.key} className={s.reviewGroup} aria-label={st.title}>
            <div className={s.stepHead}>
              <h3 className="px-headline">{st.title}</h3>
              <Button size="small" onClick={() => onEdit(i)}>
                Edit
              </Button>
            </div>
            <dl className={s.reviewList}>
              {rows.map(([label, value, key]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value || <span className="px-tertiary">Not given</span>}
                    {key && errs[key] && (
                      <span className={s.reviewError}> — {errs[key]}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      <section className={s.privacy} aria-label="Privacy notice">
        <h3 className="px-headline">How your information is used</h3>
        <p className="px-meta">
          The organisation hiring for this role uses what you share here only to
          assess your application and contact you about it, including for
          interviews. It is visible to their hiring team, kept for as long as
          they need it for recruitment, and not used for marketing. You can ask
          them to correct or delete it. Unsent answers are saved for 30 days so
          you can come back to them.
        </p>
        <label className={inlineCheckClass}>
          <Checkbox
            id="apply-consent"
            checked={consent}
            onChange={(e) => onConsent(e.target.checked)}
            aria-invalid={consentError ? true : undefined}
          />
          I’ve read this and agree to my information being used for this
          application.
        </label>
        {consentError && (
          <p
            className="px-meta"
            role="alert"
            style={{ color: "var(--px-danger)" }}
          >
            {consentError}
          </p>
        )}
      </section>
    </div>
  );
}

// ── Continue on another device ──────────────────────────────────────────────

function RecoverDialog({
  open,
  onClose,
  slug,
  jobId,
  initialEmail,
  onRecovered,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  jobId: string;
  initialEmail: string;
  onRecovered: (d: any) => void;
}) {
  const [email, setEmail] = useState("");
  const [codeValue, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setEmail(initialEmail);
      setCode("");
      setSent(false);
      setError("");
    }
  }, [open, initialEmail]);

  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      return setError("Enter the email you applied with.");
    setBusy(true);
    setError("");
    try {
      await apiClient.post(API_ENDPOINTS.PUBLIC_DRAFT_RECOVER(slug, jobId), {
        email: email.trim(),
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(codeValue.trim()))
      return setError("Enter the 6-digit code.");
    setBusy(true);
    setError("");
    try {
      const r = await apiClient.post(
        API_ENDPOINTS.PUBLIC_DRAFT_VERIFY(slug, jobId),
        {
          email: email.trim(),
          code: codeValue.trim(),
        },
      );
      onRecovered(r.data?.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="sm"
      title="Continue Your Application"
      description={
        sent
          ? "If there’s a saved application for this email, we’ve sent it a 6-digit code. It expires in 10 minutes."
          : "Started this application on another device? We’ll email you a code to pick it up here."
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={sent ? verify : send}>
            {sent ? "Continue" : "Email Me a Code"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void (sent ? verify() : send());
        }}
        style={{ display: "grid", gap: 12 }}
      >
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label="Email">
          <TextInput
            type="email"
            autoComplete="email"
            value={email}
            disabled={sent}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {sent && (
          <Field label="Code">
            <TextInput
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codeValue}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        )}
        {sent && (
          <button
            type="button"
            className={s.linkButton}
            onClick={send}
            disabled={busy}
          >
            Send a new code
          </button>
        )}
      </form>
    </Dialog>
  );
}
