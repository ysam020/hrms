import {
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { StaggerItem, StaggerList, sharedName, vtName } from "@next/motion";
import {
  Avatar,
  Button,
  EmptyState,
  Field,
  KeyValues,
  Page,
  Section,
  Select,
  Skeleton,
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
} from "./shared";
import s from "./ticket.module.css";

export default function Ticket() {
  const { ticketId = "" } = useParams();
  const { setAlert } = useContext(AlertContext);
  const isHr = useCanManageHelpdesk();
  const [ticket, setTicket] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTicket(unwrap(await apiClient.get(API_ENDPOINTS.TICKET(ticketId))));
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [ticketId, setAlert]);
  useEffect(() => {
    load();
  }, [load]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSending(true);
    try {
      await apiClient.post(API_ENDPOINTS.ADD_TICKET_COMMENT(ticketId), {
        comment: comment.trim(),
        isInternal: internal,
      });
      setComment("");
      setInternal(false);
      load();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSending(false);
    }
  };
  const changeStatus = async (status: string) => {
    setStatusBusy(true);
    try {
      await apiClient.patch(API_ENDPOINTS.UPDATE_TICKET(ticketId), { status });
      setAlert({
        open: true,
        message: `Marked ${label(status)}.`,
        severity: "success",
      });
      load();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setStatusBusy(false);
    }
  };

  const comments: any[] = ticket?.comments ?? [];
  return (
    <Page
      title={ticket ? `#${ticket.ticketNo ?? ticketId}` : "Ticket"}
      back={{ to: "/helpdesk", label: "Helpdesk" }}
      width="wide"
    >
      {loading && !ticket ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton width="50%" height={28} />
          <Skeleton width="80%" />
        </div>
      ) : !ticket ? (
        <EmptyState icon="ticket" title="This ticket couldn’t be found" />
      ) : (
        <div className={s.layout}>
          <div style={{ display: "grid", gap: 28, minWidth: 0 }}>
            <header
              style={sharedName(vtName("ticket", ticketId))}
              className={s.head}
            >
              <h2 className="px-title">{ticket.title}</h2>
              <div className="px-row">
                <StatusBadge tone={statusTone(ticket.status)}>
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
                    >
                      <Avatar name={personName(c.author)} size={28} />
                      <div style={{ minWidth: 0 }}>
                        <p className={s.msgMeta}>
                          <b>{personName(c.author)}</b> · {fromNow(c.createdAt)}
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
                      busy={sending}
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
              <Field label="Status">
                <Select
                  value={ticket.status}
                  disabled={statusBusy}
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
