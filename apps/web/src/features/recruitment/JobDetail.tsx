import dayjs from "dayjs";
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { hiringSchema } from "@web/shared/schemas/hiring";
import { rejectApplicationSchema } from "@web/shared/schemas/rejectApplication";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import {
  getStatusOptions,
  shouldHideStatusDropdown,
} from "@web/features/job-openings/info-modal/helpers";
import { useConnectGoogleCalendar } from "@web/features/job-openings/useConnectGoogleCalendar";
import {
  computeSalaryComponents,
  getMergedComponents,
  redistributeGross,
  type PtSlab,
  type SalaryComponentDef,
} from "@web/shared/utils/salaryCalc";
import { Collapse, TransitionLink, sharedName, vtName } from "@next/motion";
import {
  Tag,
  FormSection,
  Avatar,
  Banner,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  FormGrid,
  Inspector,
  KeyValues,
  Metric,
  Metrics,
  Page,
  PrimaryCell,
  Section,
  SegmentedControl,
  Skeleton,
  Status,
  TextArea,
  TextInput,
  fieldSpan2,
  UserCombobox,
  type Column,
  type Person,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { fmtDate, fmtDateTime, fmtMoney, readableCase } from "@next/lib/format";
import {
  PROFILE_FIELDS,
  employmentTypeLabel,
  experienceLabel,
  jobConfig,
  locationSummary,
  workplaceTypeLabel,
} from "./jobConfig";
import s from "./job.module.css";

// One opening and its pipeline — Classic's ViewIndividualJob, JobApplications,
// InfoModal, ScheduleInterviewModal, HiringModal, and RejectModal, with the
// same endpoints, permission checks, round rules, and schemas.

const PIPELINE = ["", "Applied", "Interviewing", "Hired", "Rejected"];
// Interview times travel as "YYYYMMDDTHHmmss" (calendar format).
const stamp = (d: Date) => dayjs(d).format("YYYYMMDDTHHmmss");
const fromStamp = (v?: string) =>
  v && /^\d{8}T\d{6}$/.test(v)
    ? dayjs(
        `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}`,
      )
    : dayjs(v);

export default function JobDetail() {
  const { _id = "" } = useParams();
  const { user } = useContext(UserContext);
  const perm = (a: string) =>
    hasPermission(
      "JobOpenings",
      a,
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );
  const job = useGet<any>(`/view-job-opening/${encodeURIComponent(_id)}`);
  const [stage, setStage] = useState("");
  const apps = useGet<any>(
    `/view-applications/${encodeURIComponent(_id)}?${new URLSearchParams(stage ? { status: stage } : {}).toString()}`,
  );
  const applicants = useMemo(
    () => asList<any>(apps.data, "applications"),
    [apps.data],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    applicants.find((a) => String(a.id ?? a._id) === selectedId) ?? null;
  const j = job.data && !job.data.message ? job.data : null;

  const columns: Column<any>[] = [
    {
      key: "name",
      header: "Applicant",
      priority: "primary",
      render: (a) => (
        <PrimaryCell
          leading={<Avatar name={a.name || "?"} size={28} />}
          title={a.name}
          subtitle={a.email}
        />
      ),
    },
    {
      key: "rounds",
      header: "Rounds",
      align: "right",
      priority: "secondary",
      stackLabel: "Rounds",
      render: (a) => (
        <span className="px-num">{(a.interviews || []).length}</span>
      ),
    },
    {
      key: "applied",
      header: "Applied",
      priority: "hidden",
      render: (a) => fmtDate(a.createdAt || a.appliedAt),
    },
    {
      key: "status",
      header: "Stage",
      priority: "trailing",
      render: (a) => <Status value={a.status} />,
    },
  ];

  return (
    <Page
      title={j?.jobTitle ?? "Job Opening"}
      back={{ to: "/job-openings/view-job-openings", label: "Job Openings" }}
      largeTitle
      width="wide"
      actions={
        perm("edit_job_opening") || user?.isSuperUser ? (
          <TransitionLink to={`/view-job-opening/${_id}/edit`}>
            <Button icon="edit">Edit Opening</Button>
          </TransitionLink>
        ) : undefined
      }
      inspector={
        <Inspector
          open={Boolean(selected)}
          onClose={() => setSelectedId(null)}
          title="Candidate"
          id={selectedId ?? undefined}
        >
          {selected && j && (
            <Candidate
              applicant={selected}
              jobId={_id}
              jobTitle={j.jobTitle}
              perm={perm}
              onChanged={() => {
                apps.refetch();
                job.refetch();
              }}
            />
          )}
        </Inspector>
      }
    >
      {job.loading && !j ? (
        <Skeleton width={320} height={34} />
      ) : job.error ? (
        <ErrorState message={job.error} onRetry={job.refetch} />
      ) : !j ? (
        <EmptyState icon="briefcase" title="This opening couldn’t be found" />
      ) : (
        <div style={{ display: "grid", gap: 40 }}>
          <header style={{ display: "grid", gap: 6, paddingTop: 8 }}>
            <h2 className="px-display" style={sharedName(vtName("job", _id))}>
              {j.jobTitle}
            </h2>
            <span>
              <Status value={j.status} />
            </span>
          </header>
          <Metrics label="Hiring progress">
            <Metric
              label="Openings"
              tone="accent"
              icon="briefcase"
              value={j.numberOfVacancies ?? "—"}
            />
            <Metric
              label="Hired"
              tone="success"
              icon="checkCircle"
              value={j.candidatesHired ?? 0}
            />
            <Metric
              label="Applicants"
              tone="neutral"
              icon="people"
              value={apps.loading || stage ? "—" : applicants.length}
            />
            <Metric
              label="Apply By"
              tone="warning"
              icon="calendar"
              value={fmtDate(j.applicationDeadline)}
              size="sm"
            />
          </Metrics>
          {/* Role and Hiring pair up at equal height; the long-form
              sections run full width beneath them. */}
          <div className={s.detailGrid}>
            <FormSection icon="briefcase" title="Role">
              <KeyValues
                items={[
                  [
                    "Department",
                    j.department ? readableCase(j.department) : null,
                  ],
                  ["Employment", employmentTypeLabel(j.employmentType) || null],
                  ["Workplace", workplaceTypeLabel(j.workplaceType) || null],
                  ["Location", locationSummary(j) || null],
                  ["Posted", fmtDate(j.jobPostingDate || j.createdAt)],
                ]}
              />
            </FormSection>
            <FormSection icon="people" tone="warning" title="Hiring">
              <KeyValues
                items={[
                  [
                    "Budget",
                    Array.isArray(j.budget) && j.budget.length ? (
                      <span>
                        <b className="px-num">
                          ₹{j.budget[0]}–{j.budget[1]} LPA
                        </b>
                        {j.budgetDisclosed === false && (
                          <span className="px-meta"> · not public</span>
                        )}
                      </span>
                    ) : !Array.isArray(j.budget) && j.budget ? (
                      fmtMoney(j.budget)
                    ) : null,
                  ],
                  [
                    "Hiring Manager",
                    j.hiringManager ? readableCase(j.hiringManager) : null,
                  ],
                  ["Recruiter", j.recruiter ? readableCase(j.recruiter) : null],
                  ["Min. Qualification", j.minQualification || null],
                  [
                    "Screening",
                    jobConfig(j).questions.length
                      ? `${jobConfig(j).questions.length} questions`
                      : null,
                  ],
                ]}
              />
            </FormSection>
            <FormSection
              icon="doc"
              title="About the Role"
              description={
                [
                  employmentTypeLabel(j.employmentType),
                  workplaceTypeLabel(j.workplaceType),
                  locationSummary(j),
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              {j.jobDescription ? (
                <p className={s.description}>{j.jobDescription}</p>
              ) : (
                <p className="px-tertiary">No description yet.</p>
              )}
              {j.responsibilities && (
                <div className={s.block}>
                  <h3 className={s.blockTitle}>Responsibilities</h3>
                  <p className={s.description}>{j.responsibilities}</p>
                </div>
              )}
              {j.qualifications && (
                <div className={s.block}>
                  <h3 className={s.blockTitle}>Required Qualifications</h3>
                  <p className={s.description}>{j.qualifications}</p>
                </div>
              )}
            </FormSection>
            <FormSection
              icon="checklist"
              tone="success"
              title="Skills"
              description={
                experienceLabel(j)
                  ? `${experienceLabel(j)} of experience`
                  : undefined
              }
            >
              <div className={s.skillChips}>
                {(Array.isArray(j.requiredSkills)
                  ? j.requiredSkills
                  : String(j.requiredSkills ?? "").split(",")
                )
                  .map((x: string) => x.trim())
                  .filter(Boolean)
                  .map((x: string) => (
                    <Tag key={x} tone="accent">
                      {x}
                    </Tag>
                  ))}
              </div>
              {j.preferredSkills && (
                <div className={s.block}>
                  <h3 className={s.blockTitle}>Nice to have</h3>
                  <div className={s.skillChips}>
                    {String(j.preferredSkills)
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                      .map((x) => (
                        <Tag key={x}>{x}</Tag>
                      ))}
                  </div>
                </div>
              )}
            </FormSection>
          </div>
          {perm("view_applications") || user?.isSuperUser ? (
            <Section
              title="Candidates"
              action={
                <SegmentedControl
                  role="radiogroup"
                  label="Stage"
                  value={stage}
                  onChange={setStage}
                  segments={PIPELINE.map((p) => ({
                    value: p,
                    label: p || "All",
                  }))}
                />
              }
            >
              <DataTable
                label="Candidates"
                columns={columns}
                rows={applicants}
                rowId={(a) => String(a.id ?? a._id)}
                loading={apps.loading}
                onRowClick={(a) => setSelectedId(String(a.id ?? a._id))}
                selectedId={selectedId}
                empty={{
                  icon: "people",
                  title: stage
                    ? `No ${stage.toLowerCase()} candidates`
                    : "No applications yet",
                  body: "Share the opening’s careers link to start receiving applications.",
                }}
              />
            </Section>
          ) : null}
        </div>
      )}
    </Page>
  );
}

// ── Candidate pipeline ──────────────────────────────────────────────────────

function Candidate({
  applicant: a,
  jobId,
  jobTitle,
  perm,
  onChanged,
}: {
  applicant: any;
  jobId: string;
  jobTitle: string;
  perm: (action: string) => boolean;
  onChanged: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const org = useGet<any>(API_ENDPOINTS.GET_ORG_SETTINGS);
  const interviewers = useGet<any>(API_ENDPOINTS.GET_INTERVIEWER_LIST);
  const calendar = useConnectGoogleCalendar();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "schedule" | "hire" | "reject">(
    null,
  );
  const [round, setRound] = useState<{
    index: number;
    mode: "reschedule" | "reassign" | "status";
  } | null>(null);
  const [when, setWhen] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [email, setEmail] = useState(a.assignedOfficialEmail ?? "");

  const interviews: any[] = a.interviews ?? [];
  const status: string = a.status ?? "Applied";
  const terminal = status === "Hired" || status === "Rejected";
  const maxRounds = org.data?.active?.maxInterviewRounds ?? 5;
  const nextRound = interviews.length + 1;
  const prevCleared =
    nextRound <= 1 || status === `Round ${nextRound - 1} Cleared`;
  const canScheduleNext =
    perm("schedule_interview") &&
    !terminal &&
    prevCleared &&
    nextRound <= maxRounds;
  const hasCleared =
    interviews.some((i) => i.interviewConducted && i.cleared) ||
    /Round \d+ Cleared/.test(status);
  // Only people allowed to interview (GET /get-interviewer-list); the
  // interview stores the username.
  const people: Person[] = asList<any>(interviewers.data)
    .filter((u) => u.username)
    .map((u) => ({ id: String(u.id), username: u.username, name: u.name }));
  const minStart = (() => {
    const last = interviews[interviews.length - 1];
    const end = last?.interviewEndTime
      ? fromStamp(last.interviewEndTime)
      : null;
    return (end && end.isAfter(dayjs()) ? end : dayjs()).format(
      "YYYY-MM-DDTHH:mm",
    );
  })();

  useEffect(
    () => setEmail(a.assignedOfficialEmail ?? ""),
    [a.assignedOfficialEmail],
  );

  const call = async (fn: () => Promise<any>, retry?: () => void) => {
    setBusy(true);
    try {
      const res = await fn();
      setAlert({
        open: true,
        message: res?.data?.message || "Updated.",
        severity: "success",
      });
      setDialog(null);
      setRound(null);
      setWhen("");
      setInterviewer("");
      setFeedback("");
      onChanged();
    } catch (err: any) {
      // Interview invites go through the scheduler's Google Calendar.
      if (err?.response?.data?.code === "CALENDAR_NOT_CONNECTED" && retry)
        calendar.requestConnect(retry);
      else
        setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const schedule = () => {
    if (!interviewer || !when)
      return setAlert({
        open: true,
        message: "Choose an interviewer and a time.",
        severity: "warning",
      });
    const start = new Date(when);
    const body = {
      email: a.email,
      name: a.name,
      interviewer,
      interviewStartTime: stamp(start),
      interviewEndTime: stamp(new Date(start.getTime() + 3600_000)),
      roundNumber: nextRound,
      _id: a.id,
    };
    call(() => apiClient.put(API_ENDPOINTS.SCHEDULE_INTERVIEW, body), schedule);
  };
  const reschedule = (i: number) => {
    if (!when) return;
    const start = new Date(when);
    const body = {
      interviewer: interviews[i]?.interviewer || "",
      interviewStartTime: stamp(start),
      interviewEndTime: stamp(new Date(start.getTime() + 3600_000)),
      roundNumber: interviews[i]?.roundNumber ?? i + 1,
      _id: a.id,
    };
    call(
      () => apiClient.put(API_ENDPOINTS.RESCHEDULE_INTERVIEW, body),
      () => reschedule(i),
    );
  };
  const reassign = (i: number) =>
    interviewer &&
    call(() =>
      apiClient.put(API_ENDPOINTS.REASSIGN_INTERVIEWER, {
        interviewer,
        jobTitle,
        name: a.name,
        interviewRound: interviews[i]?.roundNumber ?? i + 1,
        _id: a.id,
      }),
    );
  const updateRound = (i: number, outcome: string) => {
    const completing = outcome === "Completed";
    if (completing && !feedback.trim())
      return setAlert({
        open: true,
        message: "Add interview feedback first.",
        severity: "warning",
      });
    const n = interviews[i]?.roundNumber ?? i + 1;
    call(() =>
      apiClient.put(API_ENDPOINTS.UPDATE_CANDIDATE_STATUS, {
        status: `Round ${n} ${outcome}`,
        jobTitle,
        name: a.name,
        interviewRound: n,
        ...(completing && { feedback: feedback.trim() }),
        id: a.id,
      }),
    );
  };
  const openResume = async () => {
    try {
      const res = await apiClient.post(API_ENDPOINTS.RESUME_VIEW_URL, {
        fileUrl: a.resume,
      });
      window.open(res.data?.data?.url, "_blank", "noopener");
    } catch (err) {
      setAlert({
        open: true,
        message: errorMessage(err, "The résumé couldn’t be opened."),
        severity: "error",
      });
    }
  };

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div className="px-row" style={{ gap: 12 }}>
        <Avatar name={a.name} size={44} />
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <span className="px-section">{a.name}</span>
          <span>
            <Status value={status} />
          </span>
        </div>
      </div>
      {a.possibleDuplicateOfCandidateId && (
        <Banner tone="warning">
          Someone with the same email or mobile has applied before. They may be
          the same person — check before treating them as a new candidate.
        </Banner>
      )}
      <KeyValues
        items={[
          ["Email", a.email],
          ["Phone", a.mobile || a.phone],
          ["Applied", fmtDate(a.submittedAt || a.createdAt)],
          ...profileRows(a.profile),
          [
            "Résumé",
            a.resume ? (
              <button
                type="button"
                className="px-link-button"
                onClick={openResume}
              >
                Open Résumé
              </button>
            ) : null,
          ],
        ]}
      />

      {(a.screeningAnswers?.length > 0 || a.coverLetter) && (
        <section style={{ display: "grid", gap: 10 }}>
          <h3 className="px-headline">Application Answers</h3>
          <dl className={s.answers}>
            {(a.screeningAnswers ?? []).map((ans: any) => (
              <div key={ans.questionId}>
                <dt>{ans.label}</dt>
                <dd>{answerText(ans)}</dd>
              </div>
            ))}
            {a.coverLetter && (
              <div>
                <dt>Cover Letter</dt>
                <dd>{a.coverLetter}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <section style={{ display: "grid", gap: 10 }}>
        <h3 className="px-headline">Interviews</h3>
        {interviews.length === 0 && (
          <p className="px-tertiary px-callout">No rounds scheduled yet.</p>
        )}
        <ol className={s.rounds}>
          {interviews.map((iv, i) => {
            const n = iv.roundNumber ?? i + 1;
            const ended = iv.interviewEndTime
              ? fromStamp(iv.interviewEndTime).isBefore(dayjs())
              : false;
            const hideStatus = shouldHideStatusDropdown(n, status);
            const open = round?.index === i;
            return (
              <li key={n} className={s.round}>
                <div
                  className="px-row"
                  style={{ justifyContent: "space-between" }}
                >
                  <b>Round {n}</b>
                  <span className="px-meta">
                    {iv.interviewConducted
                      ? iv.cleared
                        ? "Cleared"
                        : "Completed"
                      : "Scheduled"}
                  </span>
                </div>
                <span className="px-callout px-secondary">
                  {fmtDateTime(fromStamp(iv.interviewStartTime).toDate())} ·{" "}
                  {iv.interviewer}
                </span>
                {iv.feedback && <p className="px-callout">“{iv.feedback}”</p>}
                {!terminal && (
                  <div className="px-row">
                    {!iv.interviewConducted && perm("schedule_interview") && (
                      <Button
                        size="small"
                        variant="plain"
                        onClick={() =>
                          setRound(
                            open && round?.mode === "reschedule"
                              ? null
                              : { index: i, mode: "reschedule" },
                          )
                        }
                      >
                        Reschedule
                      </Button>
                    )}
                    {!iv.interviewConducted && perm("reassign_interviewer") && (
                      <Button
                        size="small"
                        variant="plain"
                        onClick={() =>
                          setRound(
                            open && round?.mode === "reassign"
                              ? null
                              : { index: i, mode: "reassign" },
                          )
                        }
                      >
                        Reassign
                      </Button>
                    )}
                    {!hideStatus &&
                      perm("update_candidate_status") &&
                      ended && (
                        <Button
                          size="small"
                          variant="tinted"
                          onClick={() =>
                            setRound(
                              open && round?.mode === "status"
                                ? null
                                : { index: i, mode: "status" },
                            )
                          }
                        >
                          {getStatusOptions(iv)[0] === "Cleared"
                            ? "Mark Cleared"
                            : "Record Outcome"}
                        </Button>
                      )}
                    {!hideStatus && !ended && !iv.interviewConducted && (
                      <span className="px-meta">
                        Outcome can be recorded after the interview.
                      </span>
                    )}
                  </div>
                )}
                <Collapse open={open}>
                  <div className={s.roundForm}>
                    {round?.mode === "reschedule" && (
                      <>
                        <Field label="New time" hint="Interviews are one hour.">
                          <TextInput
                            type="datetime-local"
                            min={dayjs().format("YYYY-MM-DDTHH:mm")}
                            value={when}
                            onChange={(e) => setWhen(e.target.value)}
                          />
                        </Field>
                        <Button
                          variant="primary"
                          size="small"
                          busy={busy}
                          disabled={!when}
                          onClick={() => reschedule(i)}
                        >
                          Reschedule Round {n}
                        </Button>
                      </>
                    )}
                    {round?.mode === "reassign" && (
                      <>
                        <Field label="Interviewer">
                          <UserCombobox
                            valueKey="username"
                            options={people}
                            value={interviewer}
                            onChange={(username) => setInterviewer(username)}
                          />
                        </Field>
                        <Button
                          variant="primary"
                          size="small"
                          busy={busy}
                          disabled={!interviewer}
                          onClick={() => reassign(i)}
                        >
                          Reassign
                        </Button>
                      </>
                    )}
                    {round?.mode === "status" &&
                      (getStatusOptions(iv)[0] === "Completed" ? (
                        <>
                          <Field
                            label="Feedback"
                            hint="Required to complete the round."
                          >
                            <TextArea
                              rows={3}
                              value={feedback}
                              onChange={(e) => setFeedback(e.target.value)}
                            />
                          </Field>
                          <Button
                            variant="primary"
                            size="small"
                            busy={busy}
                            onClick={() => updateRound(i, "Completed")}
                          >
                            Complete Round {n}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="primary"
                          size="small"
                          busy={busy}
                          onClick={() => updateRound(i, "Cleared")}
                        >
                          Mark Round {n} Cleared
                        </Button>
                      ))}
                  </div>
                </Collapse>
              </li>
            );
          })}
        </ol>
        {!terminal && perm("schedule_interview") && (
          <div>
            {canScheduleNext ? (
              <Button
                size="small"
                icon="calendar"
                onClick={() => setDialog("schedule")}
              >
                Schedule Round {nextRound}
              </Button>
            ) : nextRound > maxRounds ? (
              <span className="px-meta">All {maxRounds} rounds are used.</span>
            ) : (
              <span className="px-meta">
                Clear round {nextRound - 1} to schedule the next one.
              </span>
            )}
          </div>
        )}
      </section>

      {status === "Hired" && perm("hire_candidate") && (
        <section style={{ display: "grid", gap: 8 }}>
          <h3 className="px-headline">Work Email</h3>
          <div className="px-row" style={{ flexWrap: "nowrap" }}>
            <TextInput
              type="email"
              aria-label="Assigned work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              busy={busy}
              onClick={() =>
                call(() =>
                  apiClient.put(API_ENDPOINTS.UPDATE_ASSIGNED_OFFICIAL_EMAIL, {
                    id: a.id,
                    assignedOfficialEmail: email.trim(),
                  }),
                )
              }
            >
              Save
            </Button>
          </div>
        </section>
      )}

      {!terminal && (
        <div className="px-row" style={{ justifyContent: "flex-end" }}>
          {perm("reject_candidate") && (
            <Button variant="tintedDanger" onClick={() => setDialog("reject")}>
              Reject
            </Button>
          )}
          {perm("hire_candidate") && hasCleared && (
            <Button variant="primary" onClick={() => setDialog("hire")}>
              Hire
            </Button>
          )}
        </div>
      )}

      <Dialog
        open={dialog === "schedule"}
        onClose={() => setDialog(null)}
        busy={busy}
        size="sm"
        title={`Schedule Round ${nextRound}`}
        description="A one-hour calendar invite goes to the candidate and interviewer."
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" busy={busy} onClick={schedule}>
              Schedule
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Interviewer">
            <UserCombobox
              data-autofocus
              valueKey="username"
              options={people}
              value={interviewer}
              onChange={(username) => setInterviewer(username)}
            />
          </Field>
          <Field label="Starts">
            <TextInput
              type="datetime-local"
              min={minStart}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </Field>
        </div>
      </Dialog>
      <RejectDialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        busy={busy}
        onSubmit={(reason) =>
          call(() =>
            apiClient.put(API_ENDPOINTS.REJECT_CANDIDATE, {
              reason,
              name: a.name,
              jobTitle,
              id: a.id,
              jobId,
            }),
          )
        }
      />
      <HireDialog
        open={dialog === "hire"}
        onClose={() => setDialog(null)}
        busy={busy}
        candidate={a.name}
        onSubmit={(payload) =>
          call(() =>
            apiClient.put(API_ENDPOINTS.HIRE_CANDIDATE, {
              ...payload,
              jobTitle,
              email: a.email,
              name: a.name,
              id: a.id,
              jobId,
            }),
          )
        }
      />
      <Dialog
        open={calendar.promptOpen}
        onClose={calendar.closePrompt}
        size="sm"
        title="Connect Google Calendar"
        description="Interview invites are sent from your Google Calendar. Connect it once, then try again."
        icon={{ name: "calendar", tone: "accent" }}
        footer={
          <>
            <Button onClick={calendar.closePrompt}>Not Now</Button>
            <Button variant="primary" onClick={calendar.startConnectFlow}>
              Connect
            </Button>
          </>
        }
      />
    </div>
  );
}

function RejectDialog({
  open,
  onClose,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);
  const go = () => {
    const p = rejectApplicationSchema.safeParse({ reason });
    if (!p.success) return setError(p.error.issues[0].message);
    onSubmit(reason.trim());
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="sm"
      title="Reject Candidate?"
      icon={{ name: "alert", tone: "danger" }}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" busy={busy} onClick={go}>
            Reject
          </Button>
        </>
      }
    >
      <Field
        label="Reason"
        error={error}
        hint="Kept on the application record."
      >
        <TextArea
          data-autofocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Dialog>
  );
}

function HireDialog({
  open,
  onClose,
  busy,
  candidate,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  candidate: string;
  onSubmit: (p: {
    components: { code: string; name: string; type: string; amount: number }[];
    joining_date: string;
    reference_by: string;
  }) => void;
}) {
  const [defs, setDefs] = useState<SalaryComponentDef[]>([]);
  const [slabs, setSlabs] = useState<PtSlab[]>([]);
  const [gross, setGross] = useState("");
  const [joining, setJoining] = useState("");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setGross("");
    setJoining("");
    setReference("");
    setErrors({});
    Promise.all([
      apiClient.get(API_ENDPOINTS.LIST_SALARY_COMPONENTS),
      apiClient.get(API_ENDPOINTS.LIST_PT_SLABS),
    ])
      .then(([c, p]) => {
        setDefs(c.data?.data ?? []);
        setSlabs(p.data?.data ?? []);
      })
      .catch(() => {});
  }, [open]);
  const merged = useMemo(() => getMergedComponents(defs), [defs]);
  // Split the gross across components the same way Classic's hiring dialog does.
  const values = useMemo(() => {
    const g = Number(gross) || 0;
    const first = redistributeGross(g, merged, {}, new Set());
    const { values: derived } = computeSalaryComponents({
      basicPay: first.BASIC ?? 0,
      grossSalary: g,
      components: merged,
      ptSlabs: slabs,
    });
    return { ...first, ...derived };
  }, [gross, merged, slabs]);
  const go = () => {
    const p = hiringSchema.safeParse({
      grossSalary: gross,
      joining_date: joining,
      reference_by: reference,
    });
    if (!p.success) {
      const n: Record<string, string> = {};
      for (const i of p.error.issues) n[String(i.path[0])] ??= i.message;
      return setErrors(n);
    }
    onSubmit({
      components: merged.map((c) => ({
        code: c.code,
        name: c.name,
        type: c.type,
        amount: values[c.code] ?? 0,
      })),
      joining_date: joining,
      reference_by: reference,
    });
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      title={`Hire ${candidate}`}
      description="Creates the employee record with this starting salary."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} onClick={go}>
            Hire
          </Button>
        </>
      }
    >
      <FormGrid columns={2}>
        <Field label="Monthly Gross (₹)" error={errors.grossSalary}>
          <TextInput
            data-autofocus
            type="number"
            min={1}
            inputMode="numeric"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
          />
        </Field>
        <Field label="Joining Date" error={errors.joining_date}>
          <TextInput
            type="date"
            value={joining}
            onChange={(e) => setJoining(e.target.value)}
          />
        </Field>
        <Field label="Referred By" optional className={fieldSpan2}>
          <TextInput
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
      </FormGrid>
      <Collapse open={Number(gross) > 0 && merged.length > 0}>
        <div style={{ paddingTop: 16 }}>
          <Banner tone="neutral">
            {merged
              .filter((c) => (values[c.code] ?? 0) > 0)
              .map((c) => `${c.name} ${fmtMoney(values[c.code])}`)
              .join(" · ")}
          </Banner>
        </div>
      </Collapse>
    </Dialog>
  );
}

// Profile answers from the configurable application form, in form order.
function profileRows(profile: any): [string, ReactNode][] {
  if (!profile || typeof profile !== "object") return [];
  return PROFILE_FIELDS.filter(
    (f) => profile[f.key] != null && profile[f.key] !== "",
  ).map((f) => {
    const v = profile[f.key];
    const text =
      f.type === "yesno"
        ? v
          ? "Yes"
          : "No"
        : f.type === "years"
          ? `${v} years`
          : f.type === "lpa"
            ? `₹${v} LPA`
            : f.type === "days"
              ? `${v} days`
              : String(v);
    return [
      f.label,
      f.type === "url" && /^https?:\/\//.test(String(v)) ? (
        <a href={String(v)} target="_blank" rel="noopener noreferrer nofollow">
          {String(v)}
        </a>
      ) : (
        text
      ),
    ];
  });
}

const answerText = (ans: any) => {
  const v = ans?.value;
  if (Array.isArray(v)) return v.join(", ");
  if (ans?.type === "yes_no") return v === "yes" ? "Yes" : "No";
  if (ans?.type === "date" && v) return fmtDate(v);
  return String(v ?? "");
};
