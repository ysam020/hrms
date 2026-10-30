import { useContext, useRef, useState, type FormEvent } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useTransitionNavigate } from "@next/motion";
import {
  Banner,
  Button,
  Field,
  FormGrid,
  Icon,
  Page,
  Section,
  Select,
  TextArea,
  TextInput,
  fieldSpan2,
} from "@next/ui";
import { DraftNote, useOfflineDraft } from "@next/offline";
import { apiClient, errorMessage, unwrap } from "@next/lib/api";
import { NoAccess } from "@next/features/system/System";
import { AttachmentPicker } from "./Attachments";
import type { UploadedFile } from "./api";
import {
  CATEGORIES,
  DETAIL_FIELDS,
  LIMITS,
  MODULES,
  PRIORITIES,
  canRaiseSupport,
  categoryOf,
} from "./config";
import s from "./support.module.css";

const EMPTY = {
  category: "bug_report",
  subject: "",
  description: "",
  priority: "normal",
  module: "",
  details: {} as Record<string, string>,
};
type Values = typeof EMPTY;

function validate(v: Values): Record<string, string> {
  const e: Record<string, string> = {};
  const subject = v.subject.trim();
  const description = v.description.trim();
  if (subject.length < LIMITS.subjectMin)
    e.subject = `Add a short subject (at least ${LIMITS.subjectMin} characters).`;
  else if (subject.length > LIMITS.subjectMax)
    e.subject = `Keep the subject under ${LIMITS.subjectMax} characters.`;
  if (description.length < LIMITS.descriptionMin)
    e.description = `Describe it in a little more detail (at least ${LIMITS.descriptionMin} characters).`;
  else if (description.length > LIMITS.descriptionMax)
    e.description = `Keep the description under ${LIMITS.descriptionMax.toLocaleString()} characters.`;
  for (const [k, val] of Object.entries(v.details)) {
    if (val.length > LIMITS.detailMax)
      e[`details.${k}`] =
        `Keep this under ${LIMITS.detailMax.toLocaleString()} characters.`;
  }
  return e;
}

export default function NewTicket() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const navigate = useTransitionNavigate();
  const [v, setV] = useState<Values>(EMPTY);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // A ref, not state: two clicks in the same frame both see `saving` false.
  const inFlight = useRef(false);
  const draft = useOfflineDraft({
    formKey: "support.ticket",
    values: v,
    setValues: setV,
    initial: EMPTY,
  });

  if (!canRaiseSupport(user)) return <NoAccess />;

  const set =
    (k: Exclude<keyof Values, "details">) =>
    (e: { target: { value: string } }) =>
      setV((x) => ({ ...x, [k]: e.target.value }));
  const setDetail = (k: string) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, details: { ...x.details, [k]: e.target.value } }));
  const detailFields = DETAIL_FIELDS[v.category] ?? [];
  const isSecurity = v.category === "security";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current || uploading) return;
    const found = validate(v);
    setErrors(found);
    if (Object.keys(found).length) {
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      const details = Object.fromEntries(
        detailFields
          .map((f) => [f.key, v.details[f.key]?.trim() ?? ""])
          .filter(([, val]) => val),
      );
      const ticket = unwrap<{ id: string; ticketNo: string }>(
        await apiClient.post(API_ENDPOINTS.CREATE_SUPPORT_TICKET, {
          category: v.category,
          subject: v.subject.trim(),
          description: v.description.trim(),
          priority: v.priority,
          ...(v.module ? { module: v.module } : {}),
          ...(Object.keys(details).length ? { details } : {}),
          attachmentIds: files.map((f) => f.id),
        }),
      );
      await draft.clear();
      setAlert({
        open: true,
        message: `Ticket ${ticket.ticketNo} submitted.`,
        severity: "success",
      });
      navigate(`/support/tickets/${ticket.id}?created=1`);
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Page
      title="New Support Ticket"
      back={{ to: "/support", label: "Support Tickets" }}
      width="reading"
    >
      <form onSubmit={submit} noValidate className={s.stack}>
        <Section title="What is this about?">
          <fieldset className={s.categories}>
            <legend className="px-sr-only">Category</legend>
            {CATEGORIES.map((c) => (
              <label key={c.value} className={s.category}>
                <input
                  type="radio"
                  name="category"
                  value={c.value}
                  checked={v.category === c.value}
                  onChange={set("category")}
                />
                <Icon name={c.icon} />
                <span className={s.categoryLabel}>{c.label}</span>
                <span className={s.categoryHint}>{c.description}</span>
              </label>
            ))}
          </fieldset>
        </Section>

        {isSecurity ? (
          <Banner tone="warning" icon="shield">
            <b>Reporting a security concern.</b> Only you, your organization’s
            owner and people they’ve explicitly allowed can see this report.
            Don’t include passwords, access tokens or anyone’s personal data —
            describe where and how the issue appears. Security reports are
            reviewed as a priority, but this isn’t an emergency
            incident-response line and carries no guaranteed response time.
          </Banner>
        ) : (
          <p className={s.notice}>
            Never include passwords, access tokens or employees’ personal data
            in a ticket. Screenshots are welcome — crop out anything sensitive.
          </p>
        )}

        <Section title="Details">
          <FormGrid columns={2}>
            <Field
              label="Subject"
              error={errors.subject}
              className={fieldSpan2}
              hint={`${v.subject.trim().length}/${LIMITS.subjectMax}`}
            >
              <TextInput
                data-autofocus
                value={v.subject}
                maxLength={LIMITS.subjectMax}
                onChange={set("subject")}
                placeholder={
                  categoryOf(v.category)?.value === "feature_request"
                    ? "e.g. Export attendance as Excel"
                    : "e.g. Payslip PDF doesn’t download"
                }
              />
            </Field>
            <Field label="Affected module" optional>
              <Select value={v.module} onChange={set("module")}>
                <option value="">Not sure / not applicable</option>
                {MODULES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="Urgency"
              hint="The Praesto team confirms the final priority."
            >
              <Select value={v.priority} onChange={set("priority")}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Description"
              error={errors.description}
              className={fieldSpan2}
            >
              <TextArea
                rows={7}
                value={v.description}
                maxLength={LIMITS.descriptionMax}
                onChange={set("description")}
                placeholder="What happened, and what were you trying to do?"
              />
            </Field>
            {detailFields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                optional
                error={errors[`details.${f.key}`]}
                className={f.multiline ? fieldSpan2 : undefined}
              >
                {f.multiline ? (
                  <TextArea
                    rows={3}
                    value={v.details[f.key] ?? ""}
                    maxLength={LIMITS.detailMax}
                    placeholder={f.placeholder}
                    onChange={setDetail(f.key)}
                  />
                ) : (
                  <TextInput
                    value={v.details[f.key] ?? ""}
                    maxLength={LIMITS.detailMax}
                    placeholder={f.placeholder}
                    onChange={setDetail(f.key)}
                  />
                )}
              </Field>
            ))}
          </FormGrid>
        </Section>

        <Section title="Attachments">
          <AttachmentPicker
            side="tenant"
            value={files}
            onChange={setFiles}
            onBusyChange={setUploading}
            disabled={saving}
          />
        </Section>

        <div className={s.formActions}>
          <DraftNote
            status={draft.status}
            savedAt={draft.savedAt}
            onDiscard={async () => {
              await draft.clear();
              setV(EMPTY);
            }}
          />
          <Button onClick={() => navigate("/support")} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={saving}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Submit Ticket"}
          </Button>
        </div>
      </form>
    </Page>
  );
}
