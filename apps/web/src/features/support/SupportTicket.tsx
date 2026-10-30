import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useParams, useSearchParams } from "react-router-dom";
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
  KeyValues,
  Page,
  Section,
  StatusBadge,
  TextArea,
} from "@next/ui";
import { apiClient, errorMessage, unwrap } from "@next/lib/api";
import { fmtDateTime } from "@next/lib/format";
import { AttachmentPicker } from "./Attachments";
import { Timeline } from "./Timeline";
import type { UploadedFile } from "./api";
import {
  LIMITS,
  REOPEN_WINDOW_DAYS,
  categoryLabel,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
} from "./config";
import s from "./support.module.css";

export default function SupportTicket() {
  const { ticketId = "" } = useParams();
  const [params] = useSearchParams();
  const { setAlert } = useContext(AlertContext);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        unwrap(await apiClient.get(API_ENDPOINTS.SUPPORT_TICKET(ticketId))),
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
  return (
    <Page
      title={t ? t.ticketNo : "Support Ticket"}
      documentTitle={t ? `${t.ticketNo} · Support` : "Support"}
      back={{ to: "/support", label: "Support Tickets" }}
      width="wide"
    >
      {loading && !data ? (
        <HeaderSkeleton />
      ) : error === "not-found" ? (
        <EmptyState icon="ticket" title="This ticket couldn’t be found">
          It may belong to someone else in your organization, or the link is
          wrong.
        </EmptyState>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        t && (
          <div className={s.layout}>
            <div className={s.stack}>
              {params.get("created") && (
                <Banner tone="success">
                  Ticket <b className={s.ref}>{t.ticketNo}</b> was submitted.
                  The Praesto team will reply here, and you’ll get a
                  notification and an email.
                </Banner>
              )}
              {t.status === "waiting_for_tenant" && (
                <Banner tone="warning">
                  The Praesto team is waiting for your reply.
                </Banner>
              )}
              <header className={s.head}>
                <span className={s.ref}>{t.ticketNo}</span>
                <h2 className={`px-title ${s.subject}`}>{t.subject}</h2>
                <div className="px-row">
                  <StatusBadge tone={statusTone(t.status)}>
                    {statusLabel(t.status, true)}
                  </StatusBadge>
                  <StatusBadge tone={priorityTone(t.priority)} plain>
                    {priorityLabel(t.priority)} priority
                  </StatusBadge>
                  <span className="px-meta">{categoryLabel(t.category)}</span>
                </div>
              </header>
              <Section title="Conversation">
                <Timeline
                  side="tenant"
                  tenant
                  ticket={t}
                  reporterName={t.isMine ? "You" : t.reporterName}
                  messages={data.messages.map((m: any) => ({
                    id: m.id,
                    body: m.body,
                    createdAt: m.createdAt,
                    authorName: m.author.name,
                    fromStaff: m.author.isStaff,
                    internal: false,
                  }))}
                  activities={data.activities.map((a: any) => ({
                    ...a,
                    actorName: a.actor.name,
                    internal: false,
                  }))}
                  attachments={data.attachments}
                />
              </Section>
              {data.permissions.canReply && (
                <ReplyForm ticketId={t.id} onSent={load} />
              )}
              {t.status === "closed" && (
                <p className="px-meta">
                  This ticket is closed. If the problem comes back, raise a new
                  ticket and mention {t.ticketNo}.
                </p>
              )}
            </div>
            <aside className={s.side} aria-label="Ticket details">
              <KeyValues
                items={[
                  ["Reference", <span className={s.ref}>{t.ticketNo}</span>],
                  ["Status", statusLabel(t.status, true)],
                  [
                    "Priority",
                    t.requestedPriority !== t.priority
                      ? `${priorityLabel(t.priority)} (you asked for ${priorityLabel(t.requestedPriority)})`
                      : priorityLabel(t.priority),
                  ],
                  ["Category", categoryLabel(t.category)],
                  ["Module", t.module || "—"],
                  ["Reported by", t.isMine ? "You" : t.reporterName],
                  ["Created", fmtDateTime(t.createdAt)],
                  ["Last updated", fmtDateTime(t.updatedAt)],
                  ...(t.resolvedAt
                    ? [
                        ["Resolved", fmtDateTime(t.resolvedAt)] as [
                          string,
                          string,
                        ],
                      ]
                    : []),
                ]}
              />
              <TicketActions
                ticket={t}
                canReopen={data.permissions.canReopen}
                canClose={data.permissions.canClose}
                onDone={(msg) => {
                  setAlert({ open: true, message: msg, severity: "success" });
                  load();
                }}
              />
            </aside>
          </div>
        )
      )}
    </Page>
  );
}

function ReplyForm({
  ticketId,
  onSent,
}: {
  ticketId: string;
  onSent: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim() || inFlight.current || uploading) return;
    inFlight.current = true;
    setSending(true);
    try {
      await apiClient.post(API_ENDPOINTS.SUPPORT_REPLY(ticketId), {
        body: body.trim(),
        attachmentIds: files.map((f) => f.id),
      });
      setBody("");
      setFiles([]);
      onSent();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };
  return (
    <form onSubmit={send} className={s.composer} aria-label="Reply">
      <Field label="Reply to Praesto Support">
        <TextArea
          rows={4}
          value={body}
          maxLength={LIMITS.replyMax}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add details, answer a question, or share a screenshot…"
        />
      </Field>
      <AttachmentPicker
        side="tenant"
        value={files}
        onChange={setFiles}
        onBusyChange={setUploading}
        disabled={sending}
      />
      <div className={s.composerFooter}>
        <div className={s.composerActions}>
          <Button
            type="submit"
            variant="primary"
            busy={sending}
            disabled={!body.trim() || uploading}
          >
            Send Reply
          </Button>
        </div>
      </div>
    </form>
  );
}

function TicketActions({
  ticket,
  canReopen,
  canClose,
  onDone,
}: {
  ticket: any;
  canReopen: boolean;
  canClose: boolean;
  onDone: (message: string) => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [dialog, setDialog] = useState<"reopen" | "close" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canReopen && !canClose) {
    return ticket.status === "resolved" ? (
      <p className="px-meta">
        Resolved tickets can be reopened for {REOPEN_WINDOW_DAYS} days.
      </p>
    ) : null;
  }
  const run = async () => {
    if (dialog === "reopen" && !reason.trim()) return;
    setBusy(true);
    try {
      if (dialog === "reopen") {
        await apiClient.post(API_ENDPOINTS.SUPPORT_REOPEN(ticket.id), {
          body: reason.trim(),
        });
        onDone("Ticket reopened.");
      } else {
        await apiClient.post(API_ENDPOINTS.SUPPORT_CLOSE(ticket.id));
        onDone("Ticket closed.");
      }
      setDialog(null);
      setReason("");
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {canClose && (
        <Button icon="checkCircle" block onClick={() => setDialog("close")}>
          Confirm Resolved & Close
        </Button>
      )}
      {canReopen && (
        <Button icon="refresh" block onClick={() => setDialog("reopen")}>
          Reopen Ticket
        </Button>
      )}
      <ConfirmDialog
        open={dialog === "close"}
        onClose={() => setDialog(null)}
        onConfirm={run}
        busy={busy}
        tone="accent"
        title={`Close ${ticket.ticketNo}?`}
        description="Closed tickets can’t be reopened. If the problem returns, you’ll raise a new ticket."
        confirmLabel="Close Ticket"
      />
      <ConfirmDialog
        open={dialog === "reopen"}
        onClose={() => setDialog(null)}
        onConfirm={run}
        busy={busy}
        tone="accent"
        title={`Reopen ${ticket.ticketNo}?`}
        description="Tell the Praesto team what’s still not working."
        confirmLabel="Reopen"
      >
        <Field label="What’s still wrong?">
          <TextArea
            rows={4}
            value={reason}
            maxLength={LIMITS.replyMax}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
