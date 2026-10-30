import { Avatar, Icon } from "@next/ui";
import { StaggerItem, StaggerList } from "@next/motion";
import { fmtDateTime, fromNow } from "@next/lib/format";
import { AttachmentList, type AttachmentInfo } from "./Attachments";
import type { Side } from "./api";
import { DETAIL_FIELDS, priorityLabel, statusLabel } from "./config";
import s from "./support.module.css";

// One chronological conversation for both sides: the original report,
// replies, internal notes (Praesto console only — the tenant API never
// returns them) and ticket events.

export interface TimelineMessage {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  fromStaff: boolean;
  internal: boolean;
}

export interface TimelineActivity {
  id: string;
  type: string;
  fromValue?: string | null;
  toValue?: string | null;
  createdAt: string;
  actorName: string;
  internal: boolean;
}

/** Event wording; null for events the conversation already shows. */
export function describeActivity(
  a: TimelineActivity,
  tenant: boolean,
  agentName?: (id?: string | null) => string,
): string | null {
  switch (a.type) {
    case "status_changed":
      return `${a.actorName} changed the status to ${statusLabel(a.toValue ?? "", tenant)}`;
    case "priority_changed":
      return `${a.actorName} changed the priority from ${priorityLabel(a.fromValue ?? "")} to ${priorityLabel(a.toValue ?? "")}`;
    case "assigned":
      return a.toValue
        ? `${a.actorName} assigned this to ${agentName?.(a.toValue) ?? "an agent"}`
        : `${a.actorName} unassigned this ticket`;
    case "reopened":
      return `${a.actorName} reopened this ticket`;
    case "marked_duplicate":
      return `${a.actorName} closed this as a duplicate of ${a.toValue}`;
    case "security_viewed":
      return `${a.actorName} viewed this security report`;
    default:
      return null;
  }
}

export function Timeline({
  side,
  ticket,
  reporterName,
  messages,
  activities,
  attachments,
  tenant,
  agentName,
}: {
  side: Side;
  ticket: {
    description: string;
    createdAt: string;
    category: string;
    details?: Record<string, string> | null;
  };
  reporterName: string;
  messages: TimelineMessage[];
  activities: TimelineActivity[];
  attachments: (AttachmentInfo & { messageId?: string | null })[];
  tenant: boolean;
  agentName?: (id?: string | null) => string;
}) {
  const filesFor = (messageId: string | null) =>
    attachments.filter((a) => (a.messageId ?? null) === messageId);
  const details = (DETAIL_FIELDS[ticket.category] ?? []).filter(
    (f) => ticket.details?.[f.key],
  );

  type Entry =
    | { kind: "message"; at: number; m: TimelineMessage }
    | { kind: "event"; at: number; a: TimelineActivity; text: string };
  const entries: Entry[] = [
    ...messages.map((m) => ({
      kind: "message" as const,
      at: new Date(m.createdAt).getTime(),
      m,
    })),
    ...activities.flatMap((a) => {
      const text = describeActivity(a, tenant, agentName);
      return text
        ? [
            {
              kind: "event" as const,
              at: new Date(a.createdAt).getTime(),
              a,
              text,
            },
          ]
        : [];
    }),
  ].sort((x, y) => x.at - y.at);

  return (
    <StaggerList as="ol" className={s.thread} aria-label="Conversation">
      <StaggerItem index={0} className={s.message}>
        <Avatar name={reporterName} size={28} />
        <div style={{ minWidth: 0 }}>
          <p className={s.meta}>
            <b>{reporterName}</b>
            <time
              dateTime={ticket.createdAt}
              title={fmtDateTime(ticket.createdAt)}
            >
              {fromNow(ticket.createdAt)}
            </time>
          </p>
          <p className={s.body}>{ticket.description}</p>
          {details.length > 0 && (
            <dl className={s.details}>
              {details.map((f) => (
                <div key={f.key}>
                  <dt className={s.detailLabel}>{f.label}</dt>
                  <dd className={s.body} style={{ margin: 0 }}>
                    {ticket.details![f.key]}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <AttachmentList side={side} files={filesFor(null)} />
        </div>
      </StaggerItem>
      {entries.map((e, i) =>
        e.kind === "message" ? (
          <StaggerItem
            key={e.m.id}
            index={i + 1}
            className={s.message}
            data-staff={(e.m.fromStaff && !e.m.internal) || undefined}
            data-internal={e.m.internal || undefined}
          >
            <Avatar name={e.m.authorName} size={28} />
            <div style={{ minWidth: 0 }}>
              <p className={s.meta}>
                <b>{e.m.authorName}</b>
                <time
                  dateTime={e.m.createdAt}
                  title={fmtDateTime(e.m.createdAt)}
                >
                  {fromNow(e.m.createdAt)}
                </time>
                {e.m.internal && (
                  <span className={s.internalTag}>
                    <Icon name="lock" /> Internal note · Praesto only
                  </span>
                )}
              </p>
              <p className={s.body}>{e.m.body}</p>
              <AttachmentList side={side} files={filesFor(e.m.id)} />
            </div>
          </StaggerItem>
        ) : (
          <StaggerItem
            key={e.a.id}
            index={i + 1}
            className={s.event}
            data-internal={e.a.internal || undefined}
          >
            <Icon name={e.a.internal ? "lock" : "info"} />
            <span>
              {e.text} ·{" "}
              <time dateTime={e.a.createdAt} title={fmtDateTime(e.a.createdAt)}>
                {fromNow(e.a.createdAt)}
              </time>
            </span>
          </StaggerItem>
        ),
      )}
    </StaggerList>
  );
}
