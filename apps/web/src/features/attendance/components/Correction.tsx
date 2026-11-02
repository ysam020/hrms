import dayjs from "dayjs";
import { useContext, useState, type FormEvent } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Banner,
  Button,
  Card,
  Field,
  FormSection,
  Icon,
  SummaryRow,
  TextInput,
  UserCombobox,
  focusFirstInvalid,
  type Person,
} from "@next/ui";
import a from "../attendance.module.css";
import { apiClient, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { fmtDate, fmtTime } from "@next/lib/format";

// ── Correction ──────────────────────────────────────────────────────────────

export function Correction() {
  const { setAlert } = useContext(AlertContext);
  const [values, setValues] = useState({ userId: "", timeIn: "", timeOut: "" });
  const [person, setPerson] = useState<Person | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // The allowance for the chosen employee in the month being corrected.
  // The gateway only lets a caller read their own summary unless they're
  // privileged; a refusal just hides the indicator.
  const forMonth = values.timeIn ? dayjs(values.timeIn) : dayjs();
  const allowance = useGet<any>(
    values.userId
      ? API_ENDPOINTS.GET_ATTENDANCE_SUMMARY(
          values.userId,
          forMonth.year(),
          forMonth.month() + 1,
        )
      : null,
  );
  const left = allowance.data?.remainingCorrections;
  const max = Number(allowance.data?.maxCorrectionsPerMonth) || 0;
  const noneLeft = left != null && Number(left) <= 0;

  const set = (k: keyof typeof values, v: string) => {
    setValues((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
    setDone(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!values.userId) next.userId = "Choose an employee.";
    if (!values.timeIn) next.timeIn = "Enter the time in.";
    if (
      values.timeIn &&
      values.timeOut &&
      dayjs(values.timeOut).isBefore(values.timeIn)
    )
      next.timeOut = "Time out must be after time in.";
    setErrors(next);
    if (Object.keys(next).length) return focusFirstInvalid();
    setSaving(true);
    try {
      const res = await apiClient.put(
        API_ENDPOINTS.ATTENDANCE_CORRECTION,
        values,
      );
      setAlert({
        open: true,
        message: res.data?.message || "Attendance corrected.",
        severity: "success",
      });
      setDone(
        `${person?.name ?? "The employee"}’s attendance for ${fmtDate(values.timeIn)} was corrected.`,
      );
      setValues({ userId: "", timeIn: "", timeOut: "" });
      setPerson(null);
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
    setSaving(false);
  };

  const mins =
    values.timeIn && values.timeOut
      ? dayjs(values.timeOut).diff(dayjs(values.timeIn), "minute")
      : null;

  return (
    <div className={a.correctionGrid}>
      <form
        onSubmit={submit}
        noValidate
        style={{ display: "grid", gap: 16 }}
        data-tour="corrections-form"
      >
        {done && (
          <Banner tone="success" title="Correction saved">
            {done}
          </Banner>
        )}
        <FormSection
          icon="person"
          title="Employee"
          description="Whose attendance needs fixing."
        >
          <Field label="Employee" error={errors.userId}>
            <UserCombobox
              value={values.userId}
              onChange={(userId, p) => {
                set("userId", userId);
                setPerson(p);
              }}
            />
          </Field>
          {values.userId && left != null && !allowance.loading && (
            <Banner
              tone={noneLeft ? "danger" : "accent"}
              icon={noneLeft ? "alert" : "info"}
            >
              {noneLeft
                ? `${person?.name ?? "This employee"} has used all ${max || ""} corrections for ${forMonth.format("MMMM")}. Another one will go over the allowance.`
                : `${left} of ${max || "—"} corrections left for ${forMonth.format("MMMM")}.`}
            </Banner>
          )}
        </FormSection>
        <FormSection
          icon="clock"
          title="Corrected Times"
          description="Enter the times the employee actually started and finished."
        >
          <div className={a.timeRow}>
            <div className={a.timeCard}>
              <span className={a.timeCardTitle}>
                <Icon name="arrowRight" />
                Punch In
              </span>
              <Field label="Date and Time" error={errors.timeIn}>
                <TextInput
                  type="datetime-local"
                  value={values.timeIn}
                  onChange={(e) => set("timeIn", e.target.value)}
                />
              </Field>
            </div>
            <div className={a.timeCard}>
              <span className={a.timeCardTitle}>
                <Icon name="logout" />
                Punch Out
              </span>
              <Field
                label="Date and Time"
                optional
                hint="Leave blank to fix only the punch in."
                error={errors.timeOut}
              >
                <TextInput
                  type="datetime-local"
                  value={values.timeOut}
                  min={values.timeIn || undefined}
                  onChange={(e) => set("timeOut", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </FormSection>
        <div className="px-row" style={{ justifyContent: "flex-end" }}>
          <Button type="submit" variant="primary" icon="check" busy={saving}>
            Save Correction
          </Button>
        </div>
      </form>
      <aside style={{ display: "grid", gap: 16 }}>
        <Card>
          <div style={{ display: "grid", gap: 12 }}>
            <h2 className="px-headline">Before you correct</h2>
            <ul className={a.rules}>
              <li>
                <Icon name="info" />
                Each correction counts toward the employee’s monthly allowance
                {max ? ` of ${max}` : ""}.
              </li>
              <li>
                <Icon name="info" />
                You can correct your own attendance. Correcting someone else’s
                needs super user access.
              </li>
              <li>
                <Icon name="info" />
                The times you enter replace the recorded ones for that day. A
                blank punch out keeps the existing one.
              </li>
            </ul>
          </div>
        </Card>
        <Card>
          <div style={{ display: "grid", gap: 4 }}>
            <h2 className="px-headline" style={{ marginBottom: 6 }}>
              Summary
            </h2>
            <SummaryRow
              label="Employee"
              value={person?.name ?? (values.userId ? "Selected" : "—")}
            />
            <SummaryRow
              label="Date"
              value={values.timeIn ? fmtDate(values.timeIn) : "—"}
            />
            <SummaryRow
              label="In"
              value={values.timeIn ? fmtTime(values.timeIn) : "—"}
            />
            <SummaryRow
              label="Out"
              value={values.timeOut ? fmtTime(values.timeOut) : "Unchanged"}
            />
            <SummaryRow
              label="Hours"
              emphasis
              value={
                mins != null && mins >= 0
                  ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`
                  : "—"
              }
            />
          </div>
        </Card>
      </aside>
    </div>
  );
}
