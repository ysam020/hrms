import dayjs from "dayjs";
import { useContext, useEffect, useState, type FormEvent } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import {
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  FormGrid,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  SegmentedControl,
  Status,
  TextArea,
  TextInput,
  fieldSpan2,
  type Column,
} from "@next/ui";
import { DraftNote, sendOrQueue, useOfflineDraft } from "@next/offline";
import { apiClient, errorMessage } from "@next/lib/api";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtDate, personName } from "@next/lib/format";

// Work From Home: GET/POST /wfh/requests, PATCH status and bulk status — the
// same endpoints and approver rule (HR and above, or WFH:approve) as Classic.

const STATUSES = [
  "All",
  "Pending",
  "Approved",
  "Rejected",
  "Cancelled",
] as const;
type Verb = "approve" | "reject" | "cancel";

export default function Wfh() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const isApprover =
    isHrOrAbove(user) ||
    hasPermission(
      "WFH",
      "approve",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Pending");
  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.WFH_REQUESTS(
        p,
        l,
        `${searchParam(q)}${status !== "All" ? `&status=${status}` : ""}`,
      ),
    {
      deps: [status],
      listKeys: ["requests"],
    },
  );
  const [requesting, setRequesting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<{ ids: string[]; verb: Verb } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => setSelected(new Set()), [list.data]);

  const act = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.ids.length === 1) {
        await apiClient.patch(API_ENDPOINTS.UPDATE_WFH_STATUS, {
          requestId: action.ids[0],
          action: action.verb,
        });
        setAlert({
          open: true,
          message: "Request updated.",
          severity: "success",
        });
      } else {
        const res = await apiClient.patch(
          API_ENDPOINTS.BULK_UPDATE_WFH_STATUS,
          { requestIds: action.ids, action: action.verb },
        );
        const failed = res.data?.data?.failed ?? [];
        setAlert({
          open: true,
          message: failed.length
            ? `${action.ids.length - failed.length} updated, ${failed.length} failed.`
            : `${action.ids.length} requests updated.`,
          severity: failed.length ? "warning" : "success",
        });
      }
      setAction(null);
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: "who",
      header: "Employee",
      priority: "primary",
      render: (r) => {
        const p = r.employee || r;
        return (
          <PrimaryCell
            leading={<Avatar name={personName(p)} size={28} />}
            title={personName(p)}
            subtitle={p.username}
          />
        );
      },
    },
    {
      key: "dates",
      header: "Dates",
      priority: "secondary",
      render: (r) => (
        <span className="px-num">
          {fmtDate(r.date)}
          {r.toDate && !dayjs(r.toDate).isSame(r.date, "day")
            ? ` – ${fmtDate(r.toDate)}`
            : ""}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      priority: "secondary",
      render: (r) => <span className="px-secondary">{r.reason || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => <Status value={r.status} />,
    },
    {
      key: "actions",
      header: <span className="px-sr-only">Actions</span>,
      align: "right",
      priority: "secondary",
      render: (r) => (
        <div
          className="px-row"
          style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}
        >
          {isApprover && r.status === "Pending" && r.userId !== user?.id && (
            <>
              <Button
                size="small"
                variant="tintedDanger"
                onClick={() => setAction({ ids: [r.id], verb: "reject" })}
              >
                Reject
              </Button>
              <Button
                size="small"
                variant="tinted"
                onClick={() => setAction({ ids: [r.id], verb: "approve" })}
              >
                Approve
              </Button>
            </>
          )}
          {r.userId === user?.id &&
            ["Pending", "Approved"].includes(r.status) && (
              <Button
                size="small"
                variant="plain"
                onClick={() => setAction({ ids: [r.id], verb: "cancel" })}
              >
                Withdraw
              </Button>
            )}
        </div>
      ),
    },
  ];

  const label =
    action?.verb === "approve"
      ? "Approve"
      : action?.verb === "reject"
        ? "Reject"
        : "Withdraw";
  return (
    <Page
      title="Work From Home"
      actions={
        <Button
          variant="primary"
          icon="plus"
          onClick={() => setRequesting(true)}
        >
          Request WFH
        </Button>
      }
      tabs={
        <>
          <SegmentedControl
            role="radiogroup"
            label="Status"
            value={status}
            onChange={setStatus}
            segments={STATUSES.map((s) => ({ value: s, label: s }))}
          />
          <SearchField
            label="Search people"
            value={list.query}
            onChange={(e) => list.search(e.target.value)}
            style={{ width: 220, marginLeft: "auto" }}
          />
        </>
      }
    >
      <DataTable
        label="Work from home requests"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.id)}
        loading={list.loading}
        stickyOffset={52}
        selected={isApprover && status === "Pending" ? selected : undefined}
        onSelectedChange={setSelected}
        bulkActions={
          <>
            <Button
              size="small"
              variant="tintedDanger"
              onClick={() => setAction({ ids: [...selected], verb: "reject" })}
            >
              Reject
            </Button>
            <Button
              size="small"
              variant="primary"
              onClick={() => setAction({ ids: [...selected], verb: "approve" })}
            >
              Approve
            </Button>
          </>
        }
        empty={{
          icon: "wfh",
          title:
            status === "All"
              ? "No WFH requests"
              : `No ${status.toLowerCase()} requests`,
        }}
        footer={<Pagination {...list.pageProps} />}
      />
      <RequestWfh
        open={requesting}
        onClose={() => setRequesting(false)}
        onDone={() => {
          setRequesting(false);
          list.refresh();
        }}
      />
      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        onConfirm={act}
        busy={busy}
        tone={action?.verb === "approve" ? "accent" : "danger"}
        title={`${label} ${action && action.ids.length > 1 ? `${action.ids.length} Requests` : "Request"}?`}
        confirmLabel={label}
      />
    </Page>
  );
}

const WFH_EMPTY = { date: "", toDate: "", reason: "" };

function RequestWfh({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [v, setV] = useState(WFH_EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setV(WFH_EMPTY);
      setErrors({});
    }
  }, [open]);
  const draft = useOfflineDraft({
    formKey: "wfh.request",
    values: v,
    setValues: setV,
    initial: WFH_EMPTY,
    enabled: open,
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!v.date) n.date = "Choose a date.";
    if (v.toDate && v.date && dayjs(v.toDate).isBefore(v.date))
      n.toDate = "End date can’t be before the start date.";
    if (!v.reason.trim()) n.reason = "Add a short reason.";
    setErrors(n);
    if (Object.keys(n).length) return;
    setSaving(true);
    try {
      const result = await sendOrQueue({
        kind: "wfh.request",
        label: `Work from home · ${fmtDate(v.date)}${
          v.toDate && v.toDate !== v.date ? ` – ${fmtDate(v.toDate)}` : ""
        }`,
        method: "POST",
        url: API_ENDPOINTS.REQUEST_WFH,
        body: {
          date: v.date,
          toDate: v.toDate || v.date,
          reason: v.reason.trim(),
        },
      });
      await draft.clear();
      setAlert({
        open: true,
        message: result.queued
          ? "Saved on this device. Your request will be sent when you’re back online."
          : "WFH requested.",
        severity: result.queued ? "info" : "success",
      });
      onDone();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };
  const today = dayjs().format("YYYY-MM-DD");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={saving}
      title="Request Work From Home"
      footer={
        <>
          <DraftNote
            status={draft.status}
            savedAt={draft.savedAt}
            onDiscard={async () => {
              await draft.clear();
              setV(WFH_EMPTY);
            }}
          />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="wfh-form" busy={saving}>
            Submit Request
          </Button>
        </>
      }
    >
      <form id="wfh-form" onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Field label="From" error={errors.date}>
            <TextInput
              type="date"
              min={today}
              value={v.date}
              onChange={(e) => setV((x) => ({ ...x, date: e.target.value }))}
              data-autofocus
            />
          </Field>
          <Field label="To" optional error={errors.toDate}>
            <TextInput
              type="date"
              min={v.date || today}
              value={v.toDate}
              onChange={(e) => setV((x) => ({ ...x, toDate: e.target.value }))}
            />
          </Field>
          <Field label="Reason" error={errors.reason} className={fieldSpan2}>
            <TextArea
              rows={3}
              value={v.reason}
              onChange={(e) => setV((x) => ({ ...x, reason: e.target.value }))}
            />
          </Field>
        </FormGrid>
      </form>
    </Dialog>
  );
}
