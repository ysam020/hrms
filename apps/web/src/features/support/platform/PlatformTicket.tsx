import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Banner,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  HeaderSkeleton,
  Icon,
  KeyValues,
  Page,
  Section,
  SegmentedControl,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
} from "@next/ui";
import { TransitionLink } from "@next/motion";
import { apiClient, errorMessage, unwrap } from "@next/lib/api";
import { fmtDate, fmtDateTime } from "@next/lib/format";
import { AttachmentPicker } from "../Attachments";
import { Timeline } from "../Timeline";
import type { UploadedFile } from "../api";
import {
  LIMITS,
  STAFF_TRANSITIONS,
  categoryLabel,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
} from "../config";
import { TicketControls, useAgents } from "./TicketControls";
import s from "../support.module.css";

export default function PlatformTicket() {
  const { ticketId = "" } = useParams();
  const agents = useAgents();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        unwrap(
          await apiClient.get(API_ENDPOINTS.PLATFORM_SUPPORT_TICKET(ticketId)),
        ),
      );
      setError(null);
    } catch (err: any) {
      setError(err?.response?.status === 404 ? "not-found" : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);
  useEffect(() => {
    load();
  }, [load]);

  const t = data?.ticket;
  const agentName = (id?: string | null) =>
    agents.find((a) => a.id === id)?.name ?? "an agent";
  return (
    <Page
      title={t ? t.ticketNo : "Ticket"}
      documentTitle={t ? `${t.ticketNo} · Support Console` : "Support Console"}
      back={{ to: "/platform/support", label: "Support Console" }}
      width="wide"
    >
      {loading && !data ? (
        <HeaderSkeleton />
      ) : error === "not-found" ? (
        <EmptyState icon="ticket" title="This ticket couldn’t be found" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        t && (
          <div className={s.layout}>
            <div className={s.stack}>
              {t.category === "security" && (
                <Banner tone="warning" icon="shield">
                  Security report. Views are logged. Don’t copy its contents
                  into other tools or channels.
                </Banner>
              )}
              {data.duplicateOf && (
                <Banner>
                  Closed as a duplicate of{" "}
                  <TransitionLink
                    className={s.ref}
                    to={`/platform/support/tickets/${data.duplicateOf.id}`}
                  >
                    {data.duplicateOf.ticketNo}
                  </TransitionLink>
                  .
                </Banner>
              )}
              <header className={s.head}>
                <span className={s.ref}>{t.ticketNo}</span>
                <h2 className={`px-title ${s.subject}`}>{t.subject}</h2>
                <div className="px-row">
                  <StatusBadge tone={statusTone(t.status)}>
                    {statusLabel(t.status)}
                  </StatusBadge>
                  <StatusBadge tone={priorityTone(t.priority)} plain>
                    {priorityLabel(t.priority)} priority
                  </StatusBadge>
                  <span className="px-meta">
                    {categoryLabel(t.category)} ·{" "}
                    {data.tenant?.name ?? "Unknown organization"}
                  </span>
                </div>
              </header>
              <Section title="Conversation">
                <Timeline
                  side="platform"
                  tenant={false}
                  ticket={t}
                  reporterName={data.reporter?.name ?? "Unknown"}
                  agentName={agentName}
                  messages={data.messages.map((m: any) => ({
                    id: m.id,
                    body: m.body,
                    createdAt: m.createdAt,
                    authorName:
                      m.authorType === "staff"
                        ? `${m.author?.name ?? "Agent"} · Praesto`
                        : (m.author?.name ?? "Unknown"),
                    fromStaff: m.authorType === "staff",
                    internal: m.visibility === "internal",
                  }))}
                  activities={data.activities.map((a: any) => ({
                    ...a,
                    actorName: a.actor?.name ?? "Praesto",
                    internal: a.visibility === "internal",
                  }))}
                  attachments={data.attachments}
                />
              </Section>
              {t.status !== "closed" ? (
                <Composer ticket={t} onSent={load} />
              ) : (
                <p className="px-meta">This ticket is closed.</p>
              )}
            </div>
            <aside className={s.side} aria-label="Ticket details">
              <TicketControls
                ticket={t}
                agents={agents}
                onChanged={() => load()}
              />
              <Section title="Organization" headingLevel={3}>
                <KeyValues
                  items={[
                    ["Name", data.tenant?.name ?? "—"],
                    ["Slug", data.tenant?.slug ?? "—"],
                    ["Plan", data.tenant?.planTier ?? "—"],
                    ["Subscription", data.tenant?.subscriptionStatus ?? "—"],
                    [
                      "Customer since",
                      data.tenant ? fmtDate(data.tenant.createdAt) : "—",
                    ],
                  ]}
                />
              </Section>
              <Section title="People" headingLevel={3}>
                <KeyValues
                  items={[
                    [
                      "Reporter",
                      data.reporter
                        ? `${data.reporter.name} · ${data.reporter.email ?? "no email"}`
                        : "—",
                    ],
                    [
                      "Participants",
                      data.participants.map((p: any) => p.name).join(", ") ||
                        "—",
                    ],
                  ]}
                />
              </Section>
              <Section title="Timing" headingLevel={3}>
                <KeyValues
                  items={[
                    ["Created", fmtDateTime(t.createdAt)],
                    [
                      "First response",
                      t.firstResponseAt ? fmtDateTime(t.firstResponseAt) : "—",
                    ],
                    ["Last updated", fmtDateTime(t.updatedAt)],
                    [
                      "Resolved",
                      t.resolvedAt ? fmtDateTime(t.resolvedAt) : "—",
                    ],
                    ["Reopened", t.reopenCount ? `${t.reopenCount}×` : "—"],
                  ]}
                />
              </Section>
              {t.status !== "closed" && (
                <DuplicateAction ticket={t} onDone={load} />
              )}
            </aside>
          </div>
        )
      )}
    </Page>
  );
}

function Composer({ ticket, onSent }: { ticket: any; onSent: () => void }) {
  const { setAlert } = useContext(AlertContext);
  const [mode, setMode] = useState<"public" | "internal">("public");
  // Default per the server's rule: a public reply hands the ticket to the
  // tenant — unless that move isn't allowed from here (e.g. resolved).
  const options = ["waiting_for_tenant", "in_progress", "resolved"].filter(
    (st) =>
      st === ticket.status ||
      (STAFF_TRANSITIONS[ticket.status] ?? []).includes(st),
  );
  const [status, setStatus] = useState(options[0] ?? ticket.status);
  useEffect(() => {
    setStatus(options[0] ?? ticket.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.status]);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const internal = mode === "internal";

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim() || inFlight.current || uploading) return;
    inFlight.current = true;
    setSending(true);
    try {
      await apiClient.post(API_ENDPOINTS.PLATFORM_SUPPORT_REPLY(ticket.id), {
        body: body.trim(),
        visibility: mode,
        ...(internal ? {} : { status }),
        attachmentIds: files.map((f) => f.id),
        version: ticket.version,
      });
      setBody("");
      setFiles([]);
      setAlert({
        open: true,
        message: internal
          ? "Internal note added."
          : "Reply sent to the organization.",
        severity: "success",
      });
      onSent();
    } catch (err: any) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
      if (err?.response?.status === 409) onSent();
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={send}
      className={s.composer}
      data-internal={internal || undefined}
      aria-label={internal ? "Internal note" : "Reply to organization"}
    >
      <SegmentedControl
        role="radiogroup"
        label="Message type"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setFiles([]);
        }}
        segments={[
          { value: "public", label: "Reply to Organization" },
          { value: "internal", label: "Internal Note" },
        ]}
      />
      {internal && (
        <p className={s.internalWarning} role="note">
          <Icon name="lock" />
          Only the Praesto team will see this note and its attachments. The
          organization is never shown or notified of it.
        </p>
      )}
      <Field label={internal ? "Internal note" : "Reply"}>
        <TextArea
          rows={5}
          value={body}
          maxLength={LIMITS.replyMax}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            internal ? "Notes for the team…" : "Write to the organization…"
          }
        />
      </Field>
      <AttachmentPicker
        side="platform"
        value={files}
        onChange={setFiles}
        onBusyChange={setUploading}
        disabled={sending}
      />
      <div className={s.composerFooter}>
        {!internal && options.length > 0 && (
          <Field label="Then mark as">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {options.map((st) => (
                <option key={st} value={st}>
                  {statusLabel(st)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className={s.composerActions}>
          <Button
            type="submit"
            variant={internal ? "tinted" : "primary"}
            icon={internal ? "lock" : undefined}
            busy={sending}
            disabled={!body.trim() || uploading}
          >
            {internal ? "Add Internal Note" : "Send Reply"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function DuplicateAction({
  ticket,
  onDone,
}: {
  ticket: any;
  onDone: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^PRA-\d{4}-\d{6}$/i.test(ref.trim());
  const run = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.PLATFORM_SUPPORT_DUPLICATE(ticket.id),
        {
          duplicateOfTicketNo: ref.trim().toUpperCase(),
          version: ticket.version,
        },
      );
      setAlert({
        open: true,
        message: "Closed as a duplicate.",
        severity: "success",
      });
      setOpen(false);
      onDone();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button size="small" icon="link" onClick={() => setOpen(true)}>
        Mark as Duplicate…
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={run}
        busy={busy}
        tone="accent"
        title={`Close ${ticket.ticketNo} as a duplicate?`}
        description="The organization sees which ticket it duplicates. Only tickets from the same organization can be linked."
        confirmLabel="Close as Duplicate"
      >
        <Field
          label="Original ticket"
          error={ref && !valid ? "Use the format PRA-2026-000123" : undefined}
        >
          <TextInput
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="PRA-2026-000123"
          />
        </Field>
      </ConfirmDialog>
    </>
  );
}
