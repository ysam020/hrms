import { useCallback, useContext, useEffect, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { StaggerItem, StaggerList } from "@next/motion";
import {
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  IconButton,
  Page,
  Pagination,
  Section,
  Select,
  Skeleton,
  StatusBadge,
  Switch,
  Tag,
  TextInput,
  inlineCheckClass,
  type Column,
  type Tone,
  ListSkeleton,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { fmtDateTime } from "@next/lib/format";
import { usePagedList } from "@next/lib/usePagedList";

// Webhook endpoints and delivery log (Classic's WebhookEndpoints and
// WebhookDeliveries). Events, endpoints, the one-time secret and the
// test/rotate/retry calls are Classic's.

const WEBHOOK_EVENTS = [
  "employee.created",
  "employee.updated",
  "leave.approved",
  "leave.rejected",
  "attendance.marked",
  "payroll.run.created",
  "payroll.run.approved",
  "payroll.run.disbursed",
  "asset.assigned",
  "asset.returned",
  "wfh.approved",
  "ticket.created",
  "ticket.resolved",
];
const MAX_ENDPOINTS = 10;
const mono = {
  fontFamily: "var(--px-font-mono)",
  fontSize: "0.92em",
  overflowWrap: "anywhere",
} as const;

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
}

function useEndpoints() {
  const { setAlert } = useContext(AlertContext);
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const load = useCallback(async () => {
    try {
      setEndpoints(
        asList(
          (await apiClient.get(API_ENDPOINTS.WEBHOOK_ENDPOINTS)).data?.data,
        ),
      );
    } catch (err) {
      setEndpoints([]);
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  }, [setAlert]);
  useEffect(() => {
    load();
  }, [load]);
  return { endpoints, load };
}

function SecretDialog({
  secret,
  onClose,
}: {
  secret: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog
      open={secret !== null}
      onClose={onClose}
      title="Signing Secret"
      description="Use it to verify the signature on each delivery. It won’t be shown again."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div
        className="px-row"
        style={{
          flexWrap: "nowrap",
          padding: 12,
          borderRadius: 10,
          background: "var(--px-neutral-soft)",
        }}
      >
        <code style={{ ...mono, flex: 1 }}>{secret}</code>
        <Button
          size="small"
          onClick={() => {
            navigator.clipboard
              ?.writeText(secret ?? "")
              .then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Dialog>
  );
}

// ── Endpoints ───────────────────────────────────────────────────────────────

export function EndpointsPage() {
  const { setAlert } = useContext(AlertContext);
  const { endpoints, load } = useEndpoints();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ url: "", events: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [tests, setTests] = useState<
    Record<
      string,
      { httpStatus: number; success: boolean; error?: string } | "sending"
    >
  >({});
  const [confirm, setConfirm] = useState<{
    action: "delete" | "rotate";
    ep: Endpoint;
  } | null>(null);

  const fail = (err: unknown) =>
    setAlert({ open: true, message: errorMessage(err), severity: "error" });
  const create = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post(
        API_ENDPOINTS.CREATE_WEBHOOK_ENDPOINT,
        form,
      );
      setCreating(false);
      setForm({ url: "", events: [] });
      setSecret(res.data.data?.secret ?? null);
      load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const toggleActive = async (ep: Endpoint) => {
    try {
      await apiClient.patch(API_ENDPOINTS.UPDATE_WEBHOOK_ENDPOINT(ep.id), {
        isActive: !ep.isActive,
      });
      load();
    } catch (err) {
      fail(err);
    }
  };
  const test = async (ep: Endpoint) => {
    setTests((t) => ({ ...t, [ep.id]: "sending" }));
    try {
      const res = await apiClient.post(API_ENDPOINTS.TEST_WEBHOOK_ENDPOINT, {
        endpointId: ep.id,
      });
      setTests((t) => ({ ...t, [ep.id]: res.data.data }));
    } catch (err) {
      setTests(({ [ep.id]: _, ...rest }) => rest);
      fail(err);
    }
  };
  const confirmed = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === "delete") {
        await apiClient.delete(
          API_ENDPOINTS.DELETE_WEBHOOK_ENDPOINT(confirm.ep.id),
        );
        setAlert({
          open: true,
          message: "Endpoint deleted.",
          severity: "success",
        });
        load();
      } else {
        const res = await apiClient.patch(
          API_ENDPOINTS.UPDATE_WEBHOOK_ENDPOINT(confirm.ep.id),
          { rotate: true },
        );
        setSecret(res.data.data?.secret ?? null);
      }
      setConfirm(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const atLimit = (endpoints?.length ?? 0) >= MAX_ENDPOINTS;
  const validUrl = /^https:\/\/\S+$/.test(form.url.trim());

  return (
    <Page
      title="Webhook Endpoints"
      actions={
        <Button
          variant="primary"
          icon="plus"
          disabled={atLimit}
          onClick={() => setCreating(true)}
        >
          Add Endpoint
        </Button>
      }
    >
      <p className="px-secondary px-callout">
        Send events to your own systems as they happen. Up to {MAX_ENDPOINTS}{" "}
        endpoints.
      </p>
      {endpoints === null ? (
        <ListSkeleton rows={2} trailing />
      ) : endpoints.length === 0 ? (
        <p className="px-tertiary px-callout">
          No endpoints yet. Add one to start receiving events.
        </p>
      ) : (
        <StaggerList style={{ display: "grid", gap: 28 }}>
          {endpoints.map((ep, i) => {
            const t = tests[ep.id];
            return (
              <StaggerItem key={ep.id} index={i}>
                <Section
                  title={<span style={mono}>{ep.url}</span>}
                  detail={
                    ep.isActive ? undefined : "Paused: no events are sent"
                  }
                  action={
                    <span
                      className="px-row"
                      style={{ flexWrap: "nowrap", gap: 2 }}
                    >
                      <Switch
                        label={
                          ep.isActive ? `Pause ${ep.url}` : `Resume ${ep.url}`
                        }
                        checked={ep.isActive}
                        onChange={() => toggleActive(ep)}
                      />
                      <IconButton
                        icon="play"
                        label="Send test event"
                        disabled={t === "sending"}
                        onClick={() => test(ep)}
                      />
                      <IconButton
                        icon="key"
                        label="Rotate secret"
                        onClick={() => setConfirm({ action: "rotate", ep })}
                      />
                      <IconButton
                        icon="trash"
                        label="Delete endpoint"
                        onClick={() => setConfirm({ action: "delete", ep })}
                      />
                    </span>
                  }
                >
                  <ul className="px-row" style={{ gap: 6 }}>
                    {ep.events?.map((ev) => (
                      <li key={ev}>
                        <Tag>
                          <span style={mono}>{ev}</span>
                        </Tag>
                      </li>
                    ))}
                  </ul>
                  {t && t !== "sending" && (
                    <p
                      className="px-callout"
                      role="status"
                      style={{ marginTop: 8 }}
                    >
                      <StatusBadge tone={t.success ? "success" : "danger"}>
                        {t.success ? "Test delivered" : "Test failed"}
                      </StatusBadge>{" "}
                      <span className="px-secondary">
                        {t.success
                          ? `HTTP ${t.httpStatus}`
                          : t.error || `HTTP ${t.httpStatus}`}
                      </span>
                    </p>
                  )}
                </Section>
              </StaggerItem>
            );
          })}
        </StaggerList>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        busy={busy}
        title="Add Endpoint"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!validUrl || form.events.length === 0}
              onClick={create}
            >
              Add
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 16 }}>
          <Field label="URL" hint="Must use HTTPS">
            <TextInput
              data-autofocus
              type="url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://example.com/hooks/praesto"
            />
          </Field>
          <fieldset style={{ display: "grid", gap: 4 }}>
            <legend
              className="px-headline"
              style={{
                marginBottom: 6,
                display: "flex",
                width: "100%",
                justifyContent: "space-between",
              }}
            >
              Events
              <Button
                size="small"
                variant="plain"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    events:
                      f.events.length === WEBHOOK_EVENTS.length
                        ? []
                        : [...WEBHOOK_EVENTS],
                  }))
                }
              >
                {form.events.length === WEBHOOK_EVENTS.length
                  ? "Clear"
                  : "Select All"}
              </Button>
            </legend>
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className={inlineCheckClass}>
                <Checkbox
                  checked={form.events.includes(ev)}
                  onChange={() =>
                    setForm((f) => ({
                      ...f,
                      events: f.events.includes(ev)
                        ? f.events.filter((x) => x !== ev)
                        : [...f.events, ev],
                    }))
                  }
                />
                <span style={mono}>{ev}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </Dialog>
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={confirmed}
        busy={busy}
        tone={confirm?.action === "rotate" ? "accent" : "danger"}
        title={
          confirm?.action === "rotate"
            ? "Rotate the signing secret?"
            : "Delete this endpoint?"
        }
        description={
          confirm?.action === "rotate"
            ? "The current secret stops working right away. Update your receiver with the new one."
            : "Events stop being sent to it, and its delivery log is removed."
        }
        confirmLabel={confirm?.action === "rotate" ? "Rotate" : "Delete"}
      />
    </Page>
  );
}

// ── Delivery log ────────────────────────────────────────────────────────────

const DELIVERY: Record<string, { tone: Tone; label: string }> = {
  pending: { tone: "warning", label: "Pending" },
  retrying: { tone: "accent", label: "Retrying" },
  success: { tone: "success", label: "Delivered" },
  failed: { tone: "danger", label: "Failed" },
};

export function DeliveryLogPage() {
  const { setAlert } = useContext(AlertContext);
  const { endpoints } = useEndpoints();
  const [endpoint, setEndpoint] = useState("");
  useEffect(() => {
    if (!endpoint && endpoints?.[0]) setEndpoint(endpoints[0].id);
  }, [endpoints, endpoint]);
  const list = usePagedList(
    (p, l) =>
      endpoint ? API_ENDPOINTS.WEBHOOK_DELIVERIES(endpoint, p, l) : "",
    { deps: [endpoint], pageSize: 20 },
  );

  const retry = async (id: string) => {
    try {
      await apiClient.post(API_ENDPOINTS.RETRY_WEBHOOK_DELIVERY(id));
      setAlert({
        open: true,
        message: "Delivery queued for retry.",
        severity: "success",
      });
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };

  const columns: Column<any>[] = [
    {
      key: "event",
      header: "Event",
      priority: "primary",
      render: (r) => (
        <span className="px-headline" style={mono}>
          {r.eventType}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => (
        <StatusBadge tone={DELIVERY[r.status]?.tone ?? "neutral"}>
          {DELIVERY[r.status]?.label ?? r.status}
        </StatusBadge>
      ),
    },
    {
      key: "http",
      header: "HTTP",
      align: "right",
      priority: "secondary",
      stackLabel: "HTTP",
      render: (r) => <span className="px-num">{r.httpStatus ?? "—"}</span>,
    },
    {
      key: "attempts",
      header: "Attempts",
      align: "right",
      priority: "hidden",
      render: (r) => <span className="px-num">{r.attempts ?? 0}</span>,
    },
    {
      key: "error",
      header: "Error",
      priority: "secondary",
      render: (r) =>
        r.error ? <span className="px-secondary">{r.error}</span> : "—",
    },
    {
      key: "at",
      header: "Sent",
      priority: "secondary",
      render: (r) => fmtDateTime(r.createdAt),
    },
    {
      key: "act",
      header: <span className="px-sr-only">Actions</span>,
      align: "right",
      priority: "trailing",
      render: (r) =>
        r.status !== "success" && (
          <Button size="small" variant="plain" onClick={() => retry(r.id)}>
            Retry
          </Button>
        ),
    },
  ];

  return (
    <Page
      title="Delivery Log"
      width="wide"
      tabs={
        endpoints && endpoints.length > 0 ? (
          <Select
            aria-label="Endpoint"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            style={{ maxWidth: 420 }}
          >
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.url}
              </option>
            ))}
          </Select>
        ) : undefined
      }
    >
      {endpoints !== null && endpoints.length === 0 ? (
        <Banner icon="link">
          No endpoints yet. Add a webhook endpoint and its deliveries appear
          here.
        </Banner>
      ) : (
        <DataTable
          label="Webhook deliveries"
          columns={columns}
          rows={endpoint ? list.data : []}
          rowId={(r) => String(r.id)}
          loading={endpoints === null || list.loading}
          empty={{
            icon: "link",
            title: "No deliveries yet",
            body: "Events sent to this endpoint are listed here.",
          }}
          footer={<Pagination {...list.pageProps} />}
        />
      )}
    </Page>
  );
}
