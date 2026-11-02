import {
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useOptimistic,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { StaggerItem, StaggerList, sharedPart, useHandoff } from "@next/motion";
import {
  Avatar,
  EmptyState,
  Field,
  KeyValues,
  Page,
  Section,
  Select,
  Skeleton,
  Button,
  StatusBadge,
  Switch,
  TextArea,
  inlineCheckClass,
} from "@next/ui";
import { apiClient, errorMessage, unwrap } from "@next/lib/api";
import { fmtDateTime, fromNow, personName } from "@next/lib/format";
import {
  STATUSES,
  label,
  priorityTone,
  statusTone,
  useCanManageHelpdesk,
  type TicketSummary,
} from "./shared";
import s from "./ticket.module.css";

/** Title and badges; the title and status are shared with the list row. */
function TicketHeader({ id, ticket }: { id: string; ticket: TicketSummary }) {
  return (
    <header className={s.head}>
      <h2 className="px-title" style={sharedPart("ticket", id, "title")}>
        {ticket.title}
      </h2>
      <div className="px-row">
        <StatusBadge
          tone={statusTone(ticket.status)}
          style={sharedPart("ticket", id, "badge")}
        >
          {label(ticket.status)}
        </StatusBadge>
        <StatusBadge tone={priorityTone(ticket.priority)} plain>
          {label(ticket.priority)} priority
        </StatusBadge>
        {ticket.slaBreached && (
          <StatusBadge tone="danger">SLA Breached</StatusBadge>
        )}
      </div>
    </header>
  );
}

export default function Ticket() {
  const { ticketId = "" } = useParams();
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const isHr = useCanManageHelpdesk();
  const [ticket, setTicket] = useState<any | null>(null);
  // Opened from the list: its title and status, shown while the ticket loads.
  const preview = useHandoff<TicketSummary>("ticket", ticketId);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTicket(unwrap(await apiClient.get(API_ENDPOINTS.TICKET(ticketId))));
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
    setLoading(false);
  }, [ticketId, setAlert]);
  useEffect(() => {
    load();
  }, [load]);

  // A reply shows in the thread as soon as it's sent, marked "Sending…",
  // and is replaced by the saved copy when the ticket reloads. The box
  // clears at once for the next message; a reply that fails leaves the
  // thread and its text returns to the box.
  const [thread, addPending] = useOptimistic(
    (ticket?.comments ?? []) as any[],
    (list, pending: any) => [...list, pending],
  );
  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = comment.trim();
    if (!text) return;
    const isInternal = internal;
    setComment("");
    setInternal(false);
    const reply = {
      id: `pending:${Date.now()}`,
      comment: text,
      isInternal,
      author: user,
    };
    startTransition(async () => {
      addPending({ ...reply, pending: true });
      try {
        await apiClient.post(API_ENDPOINTS.ADD_TICKET_COMMENT(ticketId), {
          comment: text,
          isInternal,
        });
        // Saved: keep it even if the reload below fails.
        startTransition(() =>
          setTicket((t: any) =>
            t
              ? {
                  ...t,
                  comments: [
                    ...(t.comments ?? []),
                    { ...reply, createdAt: new Date().toISOString() },
                  ],
                }
              : t,
          ),
        );
        await load();
      } catch (err) {
        setAlert({ open: true, message: errorMessage(err), severity: "error" });
        setComment((c) => c || text);
        setInternal(isInternal);
      }
    });
  };

  // The new status shows at once; the select stays disabled until the
  // reloaded ticket confirms it, so two changes can't race each other.
  const [status, showStatus] = useOptimistic<string | undefined>(
    ticket?.status,
  );
  const [statusPending, startStatus] = useTransition();
  const changeStatus = (next: string) =>
    startStatus(async () => {
      showStatus(next);
      try {
        await apiClient.patch(API_ENDPOINTS.UPDATE_TICKET(ticketId), {
          status: next,
        });
        setAlert({
          open: true,
          message: `Marked ${label(next)}.`,
          severity: "success",
        });
        // Confirmed: keep it even if the reload below fails.
        startTransition(() =>
          setTicket((t: any) => (t ? { ...t, status: next } : t)),
        );
        await load();
      } catch (err) {
        setAlert({ open: true, message: errorMessage(err), severity: "error" });
      }
    });

  const comments = thread;
  return (
    <Page
      title={
        ticket
          ? `#${ticket.ticketNo ?? ticketId}`
          : preview?.ticketNo
            ? `#${preview.ticketNo}`
            : "Ticket"
      }
      back={{ to: "/helpdesk", label: "Helpdesk" }}
      width="wide"
    >
      {loading && !ticket && preview ? (
        <div className={s.layout}>
          <div style={{ display: "grid", gap: 28, minWidth: 0 }}>
            <TicketHeader id={ticketId} ticket={preview} />
          </div>
        </div>
      ) : loading && !ticket ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton width="50%" height={28} />
          <Skeleton width="80%" />
        </div>
      ) : !ticket ? (
        <EmptyState icon="ticket" title="This ticket couldn’t be found" />
      ) : (
        <div className={s.layout}>
          <div style={{ display: "grid", gap: 28, minWidth: 0 }}>
            <TicketHeader id={ticketId} ticket={{ ...ticket, status }} />
            <p className={s.description}>{ticket.description}</p>
            <Section
              title="Conversation"
              detail={comments.length ? String(comments.length) : undefined}
            >
              {comments.length === 0 ? (
                <p className="px-tertiary px-callout">No replies yet.</p>
              ) : (
                <StaggerList as="ol" className={s.thread}>
                  {comments.map((c, i) => (
                    <StaggerItem
                      key={c.id ?? i}
                      index={i}
                      className={s.message}
                      data-internal={c.isInternal || undefined}
                      data-pending={c.pending || undefined}
                    >
                      <Avatar name={personName(c.author)} size={28} />
                      <div style={{ minWidth: 0 }}>
                        <p className={s.msgMeta}>
                          <b>{personName(c.author)}</b> ·{" "}
                          {c.pending ? "Sending…" : fromNow(c.createdAt)}
                          {c.isInternal && (
                            <span className={s.internalTag}>Internal note</span>
                          )}
                        </p>
                        <p className={s.msgBody}>{c.comment}</p>
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerList>
              )}
              {!["closed"].includes(ticket.status) && (
                <form onSubmit={send} className={s.composer}>
                  <Field label="Reply">
                    <TextArea
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Write a reply…"
                    />
                  </Field>
                  <div
                    className="px-row"
                    style={{ justifyContent: "space-between" }}
                  >
                    {isHr ? (
                      <label className={inlineCheckClass}>
                        <Switch
                          checked={internal}
                          onChange={setInternal}
                          label="Internal note (HR only)"
                        />
                        Internal note
                      </label>
                    ) : (
                      <span />
                    )}
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!comment.trim()}
                    >
                      {internal ? "Add Note" : "Send Reply"}
                    </Button>
                  </div>
                </form>
              )}
            </Section>
          </div>
          <aside className={s.side}>
            <KeyValues
              items={[
                [
                  "Raised By",
                  ticket.raisedByUser ? personName(ticket.raisedByUser) : "—",
                ],
                ["Category", ticket.category],
                ["Opened", fmtDateTime(ticket.createdAt)],
                ["SLA Due", fmtDateTime(ticket.slaDeadline)],
                [
                  "Resolved",
                  ticket.resolvedAt ? fmtDateTime(ticket.resolvedAt) : null,
                ],
              ]}
            />
            {isHr && (
              <Field
                label="Status"
                hint={statusPending ? "Saving…" : undefined}
              >
                <Select
                  value={status}
                  disabled={statusPending}
                  onChange={(e) => changeStatus(e.target.value)}
                >
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {label(st)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </aside>
        </div>
      )}
    </Page>
  );
}
