import dayjs from "dayjs";
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { leaveSchema } from "@web/shared/schemas/leave";
import useFetchData from "@web/shared/hooks/useFetchData";
import { Collapse } from "@next/motion";
import {
  Button,
  Card,
  Field,
  FileField,
  FormGrid,
  FormSection,
  Icon,
  SegmentedControl,
  Select,
  Sheet,
  SummaryRow,
  Switch,
  TextArea,
  TextInput,
  TextSkeleton,
  type IconName,
} from "@next/ui";
import a from "../attendance.module.css";
import { PENDING_UPLOAD } from "@next/ui/FileField";
import { DraftNote, sendOrQueue, useOfflineDraft } from "@next/offline";
import { errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { fmtDate } from "@next/lib/format";
import { DASHBOARD_ENDPOINTS } from "@next/features/dashboard/data";

// ── Apply for leave ─────────────────────────────────────────────────────────

const EMPTY: {
  from: string;
  to: string;
  reason: string;
  leaveType: string;
  sick_leave: boolean;
  medicalCertificate: string;
  unit: string;
  session: string;
  shortLeaveHours: string;
} = {
  from: "",
  to: "",
  reason: "",
  leaveType: "PL",
  sick_leave: false,
  medicalCertificate: "",
  unit: "full_day",
  session: "",
  shortLeaveHours: "",
};

export function ApplyLeave({
  open,
  onClose,
  onApplied,
  inline,
}: {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
  /** Render as page content instead of a sheet. */
  inline?: boolean;
}) {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Kept on this device as it's filled in; restored if the sheet is reopened
  // or the app restarts before it's sent.
  const draft = useOfflineDraft({
    formKey: "leave.apply",
    values,
    setValues,
    initial: EMPTY,
    enabled: open,
  });
  // The same balances the Today dashboard shows (GET /dashboard/data); the
  // page form shows them beside the request so the choice is informed.
  const balances = useGet<any>(
    open && inline ? DASHBOARD_ENDPOINTS.DATA(["leave-balance"]) : null,
  );
  const { data: org } = useFetchData<any>(
    open ? API_ENDPOINTS.GET_ORG_SETTINGS : null,
    "get",
    [user, open],
    null,
    null,
  );

  useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setErrors({});
    }
  }, [open]);
  useEffect(() => {
    if (values.unit !== "full_day" && values.from)
      setValues((v) => ({ ...v, to: v.from }));
  }, [values.unit, values.from]);

  // Same leave-type list as Classic: statutory defaults + the org's policy.
  const types = useMemo(() => {
    const seen = new Map<string, string>();
    const add = (v?: string, l?: string) => {
      const k = v?.trim().toUpperCase();
      if (k && !seen.has(k)) seen.set(k, l?.trim() || k);
    };
    add("PL", "Paid Leave");
    add("SL", "Sick Leave");
    add("CL", "Casual Leave");
    add("MATERNITY", "Maternity Leave");
    add("PATERNITY", "Paternity Leave");
    (org?.active?.customLeaveTypes ?? []).forEach((t: any) =>
      add(t.key, t.name),
    );
    (org?.active?.leavePolicies ?? []).forEach((p: any) =>
      add(p.key, p.isCompOff ? `${p.name} (Comp Off)` : p.name),
    );
    add("LWP", "Leave Without Pay");
    return [...seen.entries()];
  }, [org]);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: "" }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const candidate = {
      ...values,
      session: values.session || undefined,
      shortLeaveHours: values.shortLeaveHours
        ? Number(values.shortLeaveHours)
        : undefined,
    };
    const parsed = leaveSchema.safeParse(candidate);
    const next: Record<string, string> = {};
    if (!parsed.success)
      for (const i of parsed.error.issues)
        next[String(i.path[0])] ??= i.message;
    if (values.reason.trim().length > 0 && values.reason.trim().length < 5)
      next.reason ??= "Use at least 5 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      // A certificate chosen offline is uploaded first, then its URL is sent.
      const cert = values.medicalCertificate;
      const pendingCert = cert.startsWith(PENDING_UPLOAD)
        ? cert.slice(PENDING_UPLOAD.length)
        : null;
      const result = await sendOrQueue({
        kind: "leave.create",
        label: `Leave request · ${fmtDate(values.from)}${
          values.to && values.to !== values.from
            ? ` – ${fmtDate(values.to)}`
            : ""
        }`,
        method: "POST",
        url: API_ENDPOINTS.ADD_LEAVE,
        body: {
          ...candidate,
          medicalCertificate: pendingCert ? "" : cert,
        },
        uploads: pendingCert
          ? [{ uploadId: pendingCert, field: "medicalCertificate" }]
          : undefined,
      });
      await draft.clear();
      setAlert({
        open: true,
        message: result.queued
          ? "Saved on this device. Your request will be sent when you’re back online."
          : result.data?.message || "Leave requested.",
        severity: result.queued ? "info" : "success",
      });
      onApplied();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
    setSaving(false);
  };

  const today = dayjs().format("YYYY-MM-DD");
  const typeLabel = types.find(([k]) => k === values.leaveType)?.[1];
  const reasonLength = values.reason.trim().length;
  const spanDays =
    values.unit === "full_day" && values.from && values.to
      ? dayjs(values.to).diff(dayjs(values.from), "day") + 1
      : null;
  const durationText =
    values.unit === "full_day"
      ? spanDays && spanDays > 0
        ? `${spanDays} calendar day${spanDays === 1 ? "" : "s"}`
        : "—"
      : values.unit === "half_day"
        ? values.session
          ? `Half day · ${values.session === "first_half" ? "first half" : "second half"}`
          : "Half day"
        : values.shortLeaveHours
          ? `${values.shortLeaveHours} hour${Number(values.shortLeaveHours) === 1 ? "" : "s"}`
          : "Short leave";
  const datesText = values.from
    ? values.unit === "full_day" && values.to && values.to !== values.from
      ? `${fmtDate(values.from)} – ${fmtDate(values.to)}`
      : fmtDate(values.from)
    : "—";

  const buttons = (
    <>
      <DraftNote
        status={draft.status}
        savedAt={draft.savedAt}
        onDiscard={async () => {
          await draft.clear();
          setValues(EMPTY);
        }}
      />
      <Button onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" form="leave-form" busy={saving}>
        Submit Request
      </Button>
    </>
  );

  const whenFields = (
    <FormGrid columns={2}>
      <Field
        label={values.unit === "full_day" ? "From" : "Date"}
        error={errors.from}
      >
        <TextInput
          type="date"
          min={today}
          value={values.from}
          onChange={set("from")}
          data-autofocus
        />
      </Field>
      {values.unit === "full_day" ? (
        <Field
          label="To"
          error={errors.to}
          hint={
            spanDays && spanDays > 0 && !errors.to
              ? `${spanDays} calendar day${spanDays === 1 ? "" : "s"}`
              : undefined
          }
        >
          <TextInput
            type="date"
            min={values.from || today}
            value={values.to}
            onChange={set("to")}
          />
        </Field>
      ) : values.unit === "half_day" ? (
        <Field label="Half" error={errors.session}>
          <Select value={values.session} onChange={set("session")}>
            <option value="">Choose…</option>
            <option value="first_half">First Half</option>
            <option value="second_half">Second Half</option>
          </Select>
        </Field>
      ) : (
        <Field
          label="Hours"
          error={errors.shortLeaveHours}
          hint="Half an hour to 7 hours"
        >
          <TextInput
            type="number"
            min={0.5}
            max={7}
            step={0.5}
            inputMode="decimal"
            value={values.shortLeaveHours}
            onChange={set("shortLeaveHours")}
          />
        </Field>
      )}
    </FormGrid>
  );

  const typeField = (
    <Field label="Leave Type">
      <Select value={values.leaveType} onChange={set("leaveType")}>
        {types.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </Field>
  );

  const reasonField = (
    <Field
      label="Reason"
      error={errors.reason}
      hint={`${reasonLength} character${reasonLength === 1 ? "" : "s"} · at least 5. Your approver sees this.`}
    >
      <TextArea value={values.reason} onChange={set("reason")} rows={3} />
    </Field>
  );

  const sick = (
    <>
      <label className={a.toggleRow}>
        <span className={a.toggleText}>
          <span>This is sick leave</span>
          <span>You can attach a medical certificate.</span>
        </span>
        <Switch
          checked={values.sick_leave}
          onChange={(v) => setValues((x) => ({ ...x, sick_leave: v }))}
          label="This is sick leave"
        />
      </label>
      <Collapse open={values.sick_leave}>
        <div style={{ paddingTop: 4 }}>
          <Field
            label="Medical Certificate"
            optional
            hint="PDF or image, up to 15 MB."
          >
            <FileField
              value={values.medicalCertificate}
              onChange={(v) =>
                setValues((x) => ({
                  ...x,
                  medicalCertificate: String(v || ""),
                }))
              }
              folder="leave_medical_certificates"
              label="Upload Certificate"
              offlineCapable
            />
          </Field>
        </div>
      </Collapse>
    </>
  );

  if (inline) {
    const balanceTypes: any[] =
      balances.data?.widgets?.["leave-balance"]?.ok === true
        ? (balances.data.widgets["leave-balance"].data?.types ?? [])
        : [];
    return (
      <div className={a.leaveGrid}>
        <form
          id="leave-form"
          onSubmit={submit}
          noValidate
          style={{ display: "grid", gap: 16 }}
          data-tour="leave-form"
        >
          <FormSection
            icon="calendar"
            title="When"
            description="Choose how long you’ll be away, then the dates."
          >
            <DurationPicker
              value={values.unit}
              onChange={(v) => setValues((x) => ({ ...x, unit: v }))}
            />
            {whenFields}
          </FormSection>
          <FormSection
            icon="leave"
            title="Details"
            description="The type of leave and a short note for your approver."
          >
            {typeField}
            {reasonField}
            {sick}
          </FormSection>
          <div className="px-row" style={{ justifyContent: "flex-end" }}>
            {buttons}
          </div>
        </form>
        <aside
          className={a.leaveAside}
          aria-label="Request summary"
          data-tour="leave-balance"
        >
          <Card>
            <div style={{ display: "grid", gap: 4 }}>
              <h2 className="px-headline" style={{ marginBottom: 6 }}>
                Your Request
              </h2>
              <SummaryRow label="Type" value={typeLabel ?? "—"} />
              <SummaryRow label="Dates" value={datesText} />
              <SummaryRow label="Duration" value={durationText} emphasis />
            </div>
          </Card>
          <Card>
            <div style={{ display: "grid", gap: 8 }}>
              <h2 className="px-headline">Available Balance</h2>
              {balances.loading ? (
                <TextSkeleton lines={3} />
              ) : balanceTypes.length ? (
                <dl className={a.balances}>
                  {balanceTypes.map((t) => (
                    <div
                      key={t.key}
                      className={a.balance}
                      data-selected={
                        String(t.key).toUpperCase() === values.leaveType ||
                        undefined
                      }
                    >
                      <dt>{t.name}</dt>
                      <dd>
                        {Number.isInteger(t.remaining)
                          ? t.remaining
                          : Number(t.remaining).toFixed(1)}
                        <small>days</small>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="px-meta">
                  Balances aren’t available right now. Your approver will check
                  them.
                </p>
              )}
            </div>
          </Card>
        </aside>
      </div>
    );
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Apply for Leave"
      width={440}
      footer={buttons}
    >
      <form
        id="leave-form"
        onSubmit={submit}
        noValidate
        style={{ display: "grid", gap: 16 }}
      >
        <Field label="Duration">
          <SegmentedControl
            role="radiogroup"
            label="Duration"
            value={values.unit}
            onChange={(v) => setValues((x) => ({ ...x, unit: v }))}
            segments={DURATIONS.map((d) => ({
              value: d.value,
              label: d.label,
            }))}
          />
        </Field>
        {whenFields}
        {typeField}
        {reasonField}
        {sick}
      </form>
    </Sheet>
  );
}

const DURATIONS: {
  value: string;
  label: string;
  note: string;
  icon: IconName;
}[] = [
  {
    value: "full_day",
    label: "Full Days",
    note: "One or more whole days",
    icon: "calendar",
  },
  {
    value: "half_day",
    label: "Half Day",
    note: "Morning or afternoon",
    icon: "halfDay",
  },
  {
    value: "short_leave",
    label: "Short Leave",
    note: "A few hours",
    icon: "clock",
  },
];

/** Three choice cards with radio semantics (arrow keys move the choice). */
function DurationPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + DURATIONS.length) % DURATIONS.length;
    refs.current[n]?.focus();
    onChange(DURATIONS[n].value);
  };
  return (
    <div className={a.durations} role="radiogroup" aria-label="Duration">
      {DURATIONS.map((d, i) => (
        <button
          key={d.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === d.value}
          tabIndex={value === d.value ? 0 : -1}
          className={a.duration}
          onClick={() => onChange(d.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          <span className={a.durationTitle}>
            <Icon name={d.icon} />
            {d.label}
          </span>
          <span className={a.durationNote}>{d.note}</span>
        </button>
      ))}
    </div>
  );
}
