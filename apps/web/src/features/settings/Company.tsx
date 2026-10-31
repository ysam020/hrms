import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  isHrOrAbove,
  isOwnerOrAdmin,
} from "@web/shared/utils/permissions/navAccess";
import { states } from "@web/assets/data/statesData";
import { StaggerItem, StaggerList } from "@next/motion";
import {
  Icon,
  FormSection,
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  FormGrid,
  IconButton,
  KeyValues,
  Page,
  Section,
  Select,
  Skeleton,
  StatusBadge,
  Switch,
  Tag,
  TextArea,
  TextInput,
  fieldSpan2,
  inlineCheckClass,
  HeaderSkeleton,
  KeyValuesSkeleton,
  ListSkeleton,
  PrimaryCell,
  type IconName,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { fmtDate, fromNow } from "@next/lib/format";
import pc from "./settings.module.css";

// Company Info, Recruitment Pipeline and Join Requests (Classic's
// CompanyInfo, RecruitmentPipelineSettings and JoinRequests). Endpoints,
// payloads and permission checks are Classic's.

// ── Company info ────────────────────────────────────────────────────────────

interface OrgProfile {
  name: string;
  helpPhone: string | null;
  helpEmail: string | null;
  officeAddress: string | null;
  tan: string | null;
  website: string | null;
  workState: string | null;
  cin: string | null;
  logoUrl: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
}
type ProfileForm = Record<Exclude<keyof OrgProfile, "name">, string>;
const PROFILE_FIELDS = [
  "helpPhone",
  "helpEmail",
  "officeAddress",
  "tan",
  "website",
  "workState",
  "cin",
  "logoUrl",
  "signatoryName",
  "signatoryDesignation",
] as const;

export function CompanyInfoPage() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const canEdit =
    isOwnerOrAdmin(user) ||
    Boolean(user?.permissions?.includes("Organisation:edit_company_info"));
  const [profile, setProfile] = useState<OrgProfile | null | undefined>(
    undefined,
  );
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient
      .get(API_ENDPOINTS.ORG_PROFILE)
      .then((r) => setProfile(r.data?.data?.orgProfile ?? null))
      .catch(() => setProfile(null));
  }, []);

  const edit = () =>
    setForm(
      Object.fromEntries(
        PROFILE_FIELDS.map((k) => [k, profile?.[k] ?? ""]),
      ) as ProfileForm,
    );
  const set = (patch: Partial<ProfileForm>) =>
    setForm((f) => (f ? { ...f, ...patch } : f));
  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await apiClient.put(
        API_ENDPOINTS.ORG_PROFILE,
        Object.fromEntries(PROFILE_FIELDS.map((k) => [k, form[k] || null])),
      );
      setProfile(res.data?.data?.orgProfile ?? profile);
      setForm(null);
      setAlert({
        open: true,
        message: "Company info saved.",
        severity: "success",
      });
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const lab = (icon: IconName, text: string) => (
    <span className={pc.kvLabel}>
      <Icon name={icon} size={14} />
      {text}
    </span>
  );
  const link = (href: string | null | undefined, text?: string | null) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer">
        {text ?? href}
      </a>
    ) : null;

  return (
    <Page
      title="Company Info"
      width="wide"
      actions={
        canEdit && profile !== undefined ? (
          <Button data-tour="company-edit" icon="edit" onClick={edit}>
            Edit
          </Button>
        ) : undefined
      }
    >
      {profile === undefined ? (
        <div style={{ display: "grid", gap: 28 }}>
          <HeaderSkeleton size={56} square />
          <KeyValuesSkeleton rows={8} />
        </div>
      ) : (
        <>
          <header className={pc.companyHero} data-tour="company-hero">
            {profile?.logoUrl ? (
              <img
                src={profile.logoUrl}
                alt=""
                width={56}
                height={56}
                style={{
                  borderRadius: 12,
                  objectFit: "contain",
                  background: "var(--px-neutral-soft)",
                }}
              />
            ) : (
              <Avatar name={profile?.name ?? "Company"} size={56} />
            )}
            <div style={{ minWidth: 0 }}>
              <h2 className="px-title">{profile?.name ?? "Your company"}</h2>
              <span className="px-meta">
                Contact and statutory details for your organization
              </span>
              <span className={pc.heroChips}>
                {profile?.website && (
                  <Tag>
                    <Icon name="link" size={12} />
                    {profile.website.replace(/^https?:\/\//, "")}
                  </Tag>
                )}
                {profile?.workState && (
                  <Tag>
                    <Icon name="pin" size={12} />
                    {profile.workState}
                  </Tag>
                )}
              </span>
            </div>
          </header>
          <div className={pc.companyGrid}>
            <FormSection
              icon="chat"
              title="Contact"
              description="Shown to employees when they need help"
            >
              <KeyValues
                items={[
                  [
                    lab("device", "Help Phone"),
                    link(
                      profile?.helpPhone && `tel:${profile.helpPhone}`,
                      profile?.helpPhone,
                    ),
                  ],
                  [
                    lab("inbox", "Help Email"),
                    link(
                      profile?.helpEmail && `mailto:${profile.helpEmail}`,
                      profile?.helpEmail,
                    ),
                  ],
                  [lab("link", "Website"), link(profile?.website)],
                  [lab("pin", "Office Address"), profile?.officeAddress],
                  [lab("flag", "State"), profile?.workState],
                ]}
              />
            </FormSection>
            <FormSection
              icon="shield"
              tone="warning"
              title="Statutory"
              description="CIN and the signatory appear on offer letters"
            >
              <KeyValues
                items={[
                  [
                    lab("doc", "TAN"),
                    profile?.tan && (
                      <span className="px-num">{profile.tan}</span>
                    ),
                  ],
                  [
                    lab("idcard", "CIN"),
                    profile?.cin && (
                      <span className="px-num">{profile.cin}</span>
                    ),
                  ],
                  [
                    lab("edit", "Authorized Signatory"),
                    profile?.signatoryName &&
                      [profile.signatoryName, profile.signatoryDesignation]
                        .filter(Boolean)
                        .join(", "),
                  ],
                ]}
              />
            </FormSection>
          </div>
        </>
      )}
      <Dialog
        open={form !== null}
        onClose={() => setForm(null)}
        busy={saving}
        size="lg"
        title="Edit Company Info"
        footer={
          <>
            <Button onClick={() => setForm(null)}>Cancel</Button>
            <Button variant="primary" busy={saving} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {form && (
          <FormGrid columns={2}>
            <Field label="Help Phone">
              <TextInput
                data-autofocus
                type="tel"
                value={form.helpPhone}
                onChange={(e) => set({ helpPhone: e.target.value })}
              />
            </Field>
            <Field label="Help Email">
              <TextInput
                type="email"
                value={form.helpEmail}
                onChange={(e) => set({ helpEmail: e.target.value })}
              />
            </Field>
            <Field label="Office Address" className={fieldSpan2}>
              <TextArea
                rows={2}
                value={form.officeAddress}
                onChange={(e) => set({ officeAddress: e.target.value })}
              />
            </Field>
            <Field label="State">
              <Select
                value={form.workState}
                onChange={(e) => set({ workState: e.target.value })}
              >
                <option value="">Choose…</option>
                {states.map((st: string) => (
                  <option key={st}>{st}</option>
                ))}
              </Select>
            </Field>
            <Field label="Website">
              <TextInput
                type="url"
                value={form.website}
                onChange={(e) => set({ website: e.target.value })}
                placeholder="https://"
              />
            </Field>
            <Field label="TAN">
              <TextInput
                value={form.tan}
                onChange={(e) => set({ tan: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="CIN">
              <TextInput
                value={form.cin}
                onChange={(e) => set({ cin: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Logo URL" className={fieldSpan2}>
              <TextInput
                type="url"
                value={form.logoUrl}
                onChange={(e) => set({ logoUrl: e.target.value })}
                placeholder="https://yourcompany.com/logo.png"
              />
            </Field>
            <Field label="Signatory Name">
              <TextInput
                value={form.signatoryName}
                onChange={(e) => set({ signatoryName: e.target.value })}
              />
            </Field>
            <Field label="Signatory Designation">
              <TextInput
                value={form.signatoryDesignation}
                onChange={(e) => set({ signatoryDesignation: e.target.value })}
              />
            </Field>
          </FormGrid>
        )}
      </Dialog>
    </Page>
  );
}

// ── Recruitment pipeline ────────────────────────────────────────────────────

interface PipelineStage {
  order: number;
  name: string;
  interviewerRole: string;
  outcomeOptions: string[];
  isBgvStage: boolean;
  bgvVendor?: string;
}
interface PipelineTemplate {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  stages: PipelineStage[];
}
const emptyStage = (order: number): PipelineStage => ({
  order,
  name: "",
  interviewerRole: "",
  outcomeOptions: ["pass", "fail", "hold"],
  isBgvStage: false,
});
const DEFAULT_STAGES: PipelineStage[] = [
  { ...emptyStage(1), name: "Screening Call", interviewerRole: "HR" },
  {
    ...emptyStage(2),
    name: "Technical Round",
    interviewerRole: "Hiring Manager",
  },
  { ...emptyStage(3), name: "HR / Salary Discussion", interviewerRole: "HR" },
];

export function PipelinePage() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const canEdit =
    isHrOrAbove(user) ||
    Boolean(
      user?.permissions?.includes("Organisation:edit_organisation_settings"),
    );
  const [templates, setTemplates] = useState<PipelineTemplate[] | null>(null);
  const [editing, setEditing] = useState<{
    id: string | null;
    name: string;
    isDefault: boolean;
    stages: PipelineStage[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  // Shown after a Save attempt, so an untouched new pipeline isn't all red.
  const [showErrors, setShowErrors] = useState(false);
  const roundsEnd = useRef<HTMLDivElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<PipelineTemplate | null>(
    null,
  );

  const fail = (err: unknown) =>
    setAlert({ open: true, message: errorMessage(err), severity: "error" });
  const load = useCallback(async () => {
    try {
      setTemplates(
        (await apiClient.get(API_ENDPOINTS.LIST_INTERVIEW_PIPELINE_TEMPLATES))
          .data?.data ?? [],
      );
    } catch (err) {
      setTemplates([]);
      fail(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const stage = (i: number, patch: Partial<PipelineStage>) =>
    setEditing(
      (e) =>
        e && {
          ...e,
          stages: e.stages.map((st, j) => (j === i ? { ...st, ...patch } : st)),
        },
    );
  const move = (i: number, by: number) =>
    setEditing((e) => {
      if (!e || i + by < 0 || i + by >= e.stages.length) return e;
      const next = [...e.stages];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return { ...e, stages: next };
    });

  const save = async () => {
    if (!editing) return;
    if (!valid) {
      setShowErrors(true);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editing.name,
        isDefault: editing.isDefault,
        stages: editing.stages.map((st, i) => ({ ...st, order: i + 1 })),
      };
      if (editing.id)
        await apiClient.put(
          API_ENDPOINTS.UPDATE_INTERVIEW_PIPELINE_TEMPLATE(editing.id),
          payload,
        );
      else
        await apiClient.post(
          API_ENDPOINTS.CREATE_INTERVIEW_PIPELINE_TEMPLATE,
          payload,
        );
      setAlert({
        open: true,
        message: editing.id ? "Pipeline updated." : "Pipeline created.",
        severity: "success",
      });
      setEditing(null);
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };
  const makeDefault = async (t: PipelineTemplate) => {
    try {
      await apiClient.put(
        API_ENDPOINTS.UPDATE_INTERVIEW_PIPELINE_TEMPLATE(t.id),
        { isDefault: true },
      );
      await load();
    } catch (err) {
      fail(err);
    }
  };
  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_INTERVIEW_PIPELINE_TEMPLATE(deleteTarget.id),
      );
      setAlert({ open: true, message: "Pipeline removed.", severity: "info" });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      fail(err);
    }
  };

  const valid =
    editing &&
    editing.name.trim() &&
    editing.stages.length > 0 &&
    editing.stages.every((st) => st.name.trim());

  return (
    <Page
      title="Recruitment Pipeline"
      description="The interview rounds a job goes through, who owns each one, and whether it includes background verification. Jobs use the default pipeline unless you pick another."
      actions={
        canEdit ? (
          <Button
            data-tour="pipeline-new"
            variant="primary"
            icon="plus"
            onClick={() => {
              setShowErrors(false);
              setEditing({
                id: null,
                name: "",
                isDefault: (templates?.length ?? 0) === 0,
                stages: DEFAULT_STAGES.map((st) => ({ ...st })),
              });
            }}
          >
            New Pipeline
          </Button>
        ) : undefined
      }
    >
      {templates === null ? (
        <ListSkeleton rows={2} trailing />
      ) : templates.length === 0 ? (
        <EmptyState icon="checklist" title="No pipelines yet">
          New jobs use the standard three-round process: screening, technical,
          and HR.
        </EmptyState>
      ) : (
        <StaggerList style={{ display: "grid", gap: 28 }}>
          {templates.map((t, i) => (
            <StaggerItem key={t.id} index={i}>
              <Section
                title={
                  <span className="px-row">
                    {t.name}
                    {t.isDefault && (
                      <StatusBadge tone="accent">Default</StatusBadge>
                    )}
                    {!t.isActive && (
                      <StatusBadge tone="neutral">Inactive</StatusBadge>
                    )}
                  </span>
                }
                detail={`${t.stages.length} ${t.stages.length === 1 ? "round" : "rounds"}`}
                action={
                  canEdit && (
                    <span className="px-row" style={{ flexWrap: "nowrap" }}>
                      {!t.isDefault && (
                        <Button
                          size="small"
                          variant="plain"
                          onClick={() => makeDefault(t)}
                        >
                          Make Default
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="plain"
                        onClick={() => {
                          setShowErrors(false);
                          setEditing({
                            id: t.id,
                            name: t.name,
                            isDefault: t.isDefault,
                            stages: t.stages.map((st) => ({ ...st })),
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="plainDanger"
                        onClick={() => setDeleteTarget(t)}
                      >
                        Delete
                      </Button>
                    </span>
                  )
                }
              >
                <ol className="px-row" style={{ gap: 6 }}>
                  {[...t.stages]
                    .sort((a, b) => a.order - b.order)
                    .map((st) => (
                      <li key={st.order}>
                        <Tag>
                          {st.order}. {st.name}
                          {st.interviewerRole && (
                            <span className="px-tertiary">
                              {`\u00a0· ${st.interviewerRole}`}
                            </span>
                          )}
                          {st.isBgvStage && (
                            <span className="px-tertiary">{"\u00a0· BGV"}</span>
                          )}
                        </Tag>
                      </li>
                    ))}
                </ol>
              </Section>
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        busy={saving}
        size="lg"
        title={editing?.id ? "Edit Pipeline" : "New Pipeline"}
        description="Rounds run in this order. Use the arrows to reorder them."
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" busy={saving} onClick={save}>
              {editing?.id ? "Save Changes" : "Create Pipeline"}
            </Button>
          </>
        }
      >
        {editing && (
          <div style={{ display: "grid", gap: 16 }}>
            <FormGrid columns={2}>
              <Field
                label="Pipeline Name"
                error={
                  showErrors && !editing.name.trim()
                    ? "Name the pipeline, e.g. Engineering."
                    : null
                }
              >
                <TextInput
                  data-autofocus
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="Engineering"
                />
              </Field>
              <label
                className={inlineCheckClass}
                style={{ alignSelf: "end", minHeight: 36 }}
              >
                <Switch
                  label="Default pipeline"
                  checked={editing.isDefault}
                  onChange={(v) => setEditing({ ...editing, isDefault: v })}
                />
                Default for new jobs
              </label>
            </FormGrid>
            <div className={pc.roundsHeader}>
              <h3 className="px-headline">Rounds</h3>
              <span className="px-meta">
                {editing.stages.length}{" "}
                {editing.stages.length === 1 ? "round" : "rounds"}
              </span>
            </div>
            <ol className={pc.rounds}>
              {editing.stages.map((st, i) => (
                <li key={i} className={pc.round}>
                  <div className={pc.roundHeader}>
                    <span className={pc.roundNumber} aria-hidden>
                      {i + 1}
                    </span>
                    <span className={pc.roundTitle}>
                      {st.name.trim() || `Round ${i + 1}`}
                      {st.isBgvStage && (
                        <StatusBadge tone="accent">BGV</StatusBadge>
                      )}
                    </span>
                    <span
                      className="px-row"
                      style={{ flexWrap: "nowrap", gap: 2 }}
                    >
                      <IconButton
                        icon="chevronUp"
                        label={`Move round ${i + 1} up`}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      />
                      <IconButton
                        icon="chevronDown"
                        label={`Move round ${i + 1} down`}
                        disabled={i === editing.stages.length - 1}
                        onClick={() => move(i, 1)}
                      />
                      <IconButton
                        icon="trash"
                        label={`Remove round ${i + 1}`}
                        disabled={editing.stages.length === 1}
                        onClick={() =>
                          setEditing({
                            ...editing,
                            stages: editing.stages.filter((_, j) => j !== i),
                          })
                        }
                      />
                    </span>
                  </div>
                  <FormGrid columns={2}>
                    <Field
                      label="Name"
                      error={
                        showErrors && !st.name.trim()
                          ? "Name this round."
                          : null
                      }
                    >
                      <TextInput
                        data-round-name={i}
                        value={st.name}
                        onChange={(e) => stage(i, { name: e.target.value })}
                        placeholder="e.g. Technical Round"
                      />
                    </Field>
                    <Field label="Interviewer Role" optional>
                      <TextInput
                        value={st.interviewerRole}
                        onChange={(e) =>
                          stage(i, { interviewerRole: e.target.value })
                        }
                        placeholder="Hiring Manager"
                      />
                    </Field>
                    <label className={`${inlineCheckClass} ${fieldSpan2}`}>
                      <Switch
                        label="Background verification"
                        checked={st.isBgvStage}
                        onChange={(v) => stage(i, { isBgvStage: v })}
                      />
                      <span style={{ display: "grid" }}>
                        <span>Background verification</span>
                        <span className="px-meta px-tertiary">
                          This round checks the candidate’s background.
                        </span>
                      </span>
                    </label>
                    {st.isBgvStage && (
                      <Field label="BGV Vendor" optional>
                        <TextInput
                          value={st.bgvVendor ?? ""}
                          onChange={(e) =>
                            stage(i, { bgvVendor: e.target.value })
                          }
                        />
                      </Field>
                    )}
                  </FormGrid>
                </li>
              ))}
            </ol>
            <div ref={roundsEnd} />
            <span>
              <Button
                size="small"
                icon="plus"
                onClick={() => {
                  const next = editing.stages.length;
                  setEditing({
                    ...editing,
                    stages: [...editing.stages, emptyStage(next + 1)],
                  });
                  // Bring the new round into view and start typing its name.
                  requestAnimationFrame(() => {
                    roundsEnd.current?.scrollIntoView({
                      block: "end",
                      behavior: "smooth",
                    });
                    document
                      .querySelector<HTMLElement>(`[data-round-name="${next}"]`)
                      ?.focus({ preventScroll: true });
                  });
                }}
              >
                Add Round
              </Button>
            </span>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title={`Delete “${deleteTarget?.name}”?`}
        description="Jobs already using this pipeline keep their rounds."
        confirmLabel="Delete"
      />
    </Page>
  );
}

// ── Join requests ───────────────────────────────────────────────────────────

interface JoinRequest {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
}

export function JoinRequestsPage() {
  const { setAlert } = useContext(AlertContext);
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [pending, setPending] = useState<{
    r: JoinRequest;
    decision: "approve" | "reject";
  } | null>(null);
  const [acting, setActing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setRequests(null);
    setLoadError(null);
    apiClient
      .get(API_ENDPOINTS.JOIN_REQUESTS)
      .then((r) => setRequests(r.data?.data?.requests ?? []))
      .catch((err) => {
        // A failed load isn't "no requests": say so and offer a retry.
        setLoadError(errorMessage(err));
        setRequests([]);
      });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async () => {
    if (!pending) return;
    const { r, decision } = pending;
    setActing(true);
    try {
      const res = await apiClient.post(
        `${API_ENDPOINTS.JOIN_REQUESTS}/${r.id}/${decision}`,
      );
      const { linkedJobApplicationId, salarySeeded } = res.data?.data || {};
      // Classic's rule: an approval that linked a hired candidate but failed to
      // seed salary needs a human, so it's a warning rather than success.
      if (decision === "approve" && linkedJobApplicationId && !salarySeeded) {
        setAlert({
          open: true,
          message:
            "Approved and linked to their hired candidate record, but their salary didn’t sync. Set it in Salary Management.",
          severity: "warning",
        });
      } else {
        setAlert({
          open: true,
          message:
            decision === "approve" ? "Request approved." : "Request rejected.",
          severity: "success",
        });
      }
      setRequests((list) => list?.filter((x) => x.id !== r.id) ?? null);
      setPending(null);
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setActing(false);
    }
  };

  return (
    <Page
      title="Join Requests"
      subtitle={
        requests && requests.length > 0
          ? `${requests.length} waiting for a decision`
          : undefined
      }
      description="People who signed up and asked to join your organisation. Approving makes them an employee; rejecting declines the request."
    >
      <DataTable
        label="Join requests"
        tour="join-table"
        loading={requests === null}
        error={loadError}
        onRetry={load}
        rows={requests ?? []}
        rowId={(r) => r.id}
        empty={{
          icon: "person",
          title: "No pending requests",
          body: "People who ask to join your organization appear here.",
        }}
        columns={[
          {
            key: "who",
            header: "Person",
            priority: "primary",
            render: (r) => (
              <PrimaryCell
                leading={<Avatar name={r.name || r.email} size={28} />}
                title={r.name || r.email}
                subtitle={r.name ? r.email : undefined}
              />
            ),
          },
          {
            key: "when",
            header: "Requested",
            priority: "secondary",
            render: (r) => (
              <span style={{ display: "grid" }}>
                <span className="px-num">{fmtDate(r.createdAt)}</span>
                <span className="px-meta">{fromNow(r.createdAt)}</span>
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            priority: "hidden",
            render: () => <StatusBadge tone="warning">Waiting</StatusBadge>,
          },
          {
            key: "act",
            header: <span className="px-sr-only">Actions</span>,
            align: "right",
            priority: "trailing",
            render: (r) => (
              <span
                className="px-row"
                style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}
              >
                <Button
                  size="small"
                  variant="tintedDanger"
                  onClick={() => setPending({ r, decision: "reject" })}
                >
                  Reject
                </Button>
                <Button
                  size="small"
                  variant="primary"
                  onClick={() => setPending({ r, decision: "approve" })}
                >
                  Approve
                </Button>
              </span>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={decide}
        busy={acting}
        tone={pending?.decision === "approve" ? "accent" : "danger"}
        title={
          pending?.decision === "approve"
            ? `Approve ${pending.r.name || pending.r.email}?`
            : `Reject ${pending?.r.name || pending?.r.email}?`
        }
        description={
          pending?.decision === "approve"
            ? "They’ll join your organization as an employee."
            : "They won’t be able to join unless they ask again."
        }
        confirmLabel={pending?.decision === "approve" ? "Approve" : "Reject"}
      />
    </Page>
  );
}
