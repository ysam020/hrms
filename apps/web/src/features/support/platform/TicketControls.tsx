import { useContext, useEffect, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { Button, ConfirmDialog, Field, Select } from "@next/ui";
import { apiClient, errorMessage, unwrap } from "@next/lib/api";
import {
  PRIORITIES,
  STAFF_TRANSITIONS,
  priorityLabel,
  statusLabel,
} from "../config";

export interface Agent {
  id: string;
  name: string;
  email: string | null;
}

let agentsCache: Promise<Agent[]> | null = null;

/** Support agents, for assignment (fetched once per session). */
export function useAgents(): Agent[] {
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => {
    agentsCache ??= apiClient
      .get(API_ENDPOINTS.PLATFORM_SUPPORT_AGENTS)
      .then((r) => unwrap<Agent[]>(r))
      .catch((err) => {
        agentsCache = null;
        throw err;
      });
    let live = true;
    agentsCache.then((a) => live && setAgents(a)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return agents;
}

type Change = {
  status?: string;
  priority?: string;
  assigneeId?: string | null;
};

// Moves that end the work on a ticket get a confirmation; the rest apply
// immediately.
const CONFIRM = new Set(["resolved", "closed"]);

/**
 * Status, priority and assignee for one ticket. Every change sends the
 * ticket's version; a 409 means someone else changed it first, and the
 * caller reloads.
 */
export function TicketControls({
  ticket,
  agents,
  onChanged,
}: {
  ticket: any;
  agents: Agent[];
  onChanged: (updated: any | null) => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Change | null>(null);

  const apply = async (change: Change) => {
    setBusy(true);
    try {
      const updated = unwrap(
        await apiClient.patch(
          API_ENDPOINTS.PLATFORM_SUPPORT_TICKET(ticket.id),
          {
            ...change,
            version: ticket.version,
          },
        ),
      );
      setAlert({ open: true, message: "Ticket updated.", severity: "success" });
      onChanged(updated);
    } catch (err: any) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
      if (err?.response?.status === 409) onChanged(null);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };
  const request = (change: Change) =>
    change.status && CONFIRM.has(change.status)
      ? setPending(change)
      : apply(change);

  const nextStatuses = STAFF_TRANSITIONS[ticket.status] ?? [];
  const isMine = ticket.assigneeId === user?.id;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Field label="Status">
        <Select
          value={ticket.status}
          disabled={busy || nextStatuses.length === 0}
          onChange={(e) => request({ status: e.target.value })}
        >
          <option value={ticket.status}>{statusLabel(ticket.status)}</option>
          {nextStatuses.map((st) => (
            <option key={st} value={st}>
              → {statusLabel(st)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Priority"
        hint={
          ticket.requestedPriority !== ticket.priority
            ? `Tenant asked for ${priorityLabel(ticket.requestedPriority)}`
            : undefined
        }
      >
        <Select
          value={ticket.priority}
          disabled={busy}
          onChange={(e) => request({ priority: e.target.value })}
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Assignee">
        <Select
          value={ticket.assigneeId ?? ""}
          disabled={busy}
          onChange={(e) => request({ assigneeId: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      {!isMine && user?.id && (
        <Button
          size="small"
          icon="person"
          disabled={busy}
          onClick={() => apply({ assigneeId: user.id })}
        >
          Assign to Me
        </Button>
      )}
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && apply(pending)}
        busy={busy}
        tone="accent"
        title={`Mark ${ticket.ticketNo} ${statusLabel(pending?.status).toLowerCase()}?`}
        description={
          pending?.status === "closed"
            ? "Closed tickets can’t be reopened by anyone. The organization is notified."
            : `The organization is notified and can reopen it within 14 days.`
        }
        confirmLabel={`Mark ${statusLabel(pending?.status)}`}
      />
    </div>
  );
}
