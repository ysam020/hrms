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
  Icon,
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
  Tag,
} from "@next/ui";
import { apiClient, errorMessage, unwrap } from "@next/lib/api";
import { fmtDateTime, fromNow } from "@next/lib/format";
import { AttachmentPicker } from "./Attachments";
import { Timeline } from "./Timeline";
import type { UploadedFile } from "./api";
import {
  categoryOf,
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
              <header className={s.headCard}>
                <span className={s.refSmall}>{t.ticketNo}</span>
                <h2 className={`px-title ${s.subject}`}>{t.subject}</h2>
                <div className={s.chips}>
                  <StatusBadge tone={statusTone(t.status)}>
                    {statusLabel(t.status, true)}
                  </StatusBadge>
                  <span
                    className={s.priority}
                    data-tone={priorityTone(t.priority)}
                  >
                    <Icon name="flag" size={12} />
                    {priorityLabel(t.priority)} priority
                  </span>
                  <Tag>
                    {categoryOf(t.category) && (
                      <Icon name={categoryOf(t.category)!.icon} size={12} />
                    )}
                    {categoryLabel(t.category)}
                  </Tag>
                  <span className="px-meta">
                    Opened {fromNow(t.createdAt)} · updated{" "}
                    {fromNow(t.updatedAt)}
                  </span>
                </div>
              </header>
              <Section
                title="Conversation"
                detail={`${data.messages.length + 1} ${data.messages.length === 0 ? "message" : "messages"}`}
              >
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
              {!data.permissions.canReply && t.status === "closed" && (
                <Banner
                  tone="neutral"
                  icon="lock"
                  title="This ticket is closed"
                >
                  Replies are turned off. If the problem comes back, raise a new
                  ticket and mention {t.ticketNo}.
                </Banner>
              )}
              {!data.permissions.canReply && t.status === "resolved" && (
                <Banner tone="success" title="Resolved">
                  Replies are turned off while it’s resolved. Reopen it from the
                  panel if the problem isn’t fixed.
                </Banner>
              )}
            </div>
            <aside className={s.side} aria-label="Ticket details">
              <section className={s.sideGroup} aria-label="Ticket">
                <h3 className={s.sideTitle}>Ticket</h3>
                <KeyValues
                  items={[
                    ["Reference", <span className={s.ref}>{t.ticketNo}</span>],
                    [
                      "Status",
                      <StatusBadge tone={statusTone(t.status)}>
                        {statusLabel(t.status, true)}
                      </StatusBadge>,
                    ],
                    [
                      "Priority",
                      <span style={{ display: "grid", gap: 2 }}>
                        <span
                          className={s.priority}
                          data-tone={priorityTone(t.priority)}
                        >
                          {priorityLabel(t.priority)}
                        </span>
                        {t.requestedPriority !== t.priority && (
                          <span className="px-meta">
                            You asked for {priorityLabel(t.requestedPriority)}
                          </span>
                        )}
                      </span>,
                    ],
                    ["Category", categoryLabel(t.category)],
                    ["Module", t.module || null],
                    ["Reported by", t.isMine ? "You" : t.reporterName],
                  ]}
                />
              </section>
              <section className={s.sideGroup} aria-label="Dates">
                <h3 className={s.sideTitle}>Dates</h3>
                <KeyValues
                  items={[
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
              </section>
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
      <Field
        label="Reply to Praesto Support"
        hint={`${body.length}/${LIMITS.replyMax} · ⌘ Enter to send`}
      >
        <TextArea
          rows={4}
          value={body}
          maxLength={LIMITS.replyMax}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl + Enter sends, as in most support tools.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
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
            icon="arrowRight"
          >
            {uploading ? "Uploading…" : "Send Reply"}
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
