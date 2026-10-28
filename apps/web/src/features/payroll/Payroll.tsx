import dayjs from "dayjs";
import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  canApproveAdvances,
  isHrOrAbove,
} from "@web/shared/utils/permissions/navAccess";
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
  SegmentedControl,
  Status,
  TextArea,
  TextInput,
  fieldSpan2,
  type Column,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fmtMoney, personName } from "@next/lib/format";

// Payroll pages — one per sidebar entry. Visibility uses Classic's own rules
// (isHrOrAbove, canManageSalary, canApproveAdvances) in navigation.ts/router.tsx.

export function PayslipsPage() {
  return (
    <Page title="My Payslips">
      <Payslips />
    </Page>
  );
}

export function AdvancesPage() {
  return (
    <Page title="Salary Advances">
      <Advances />
    </Page>
  );
}

export function RunsPage() {
  const [initiating, setInitiating] = useState(false);
  const [version, setVersion] = useState(0);
  return (
    <Page
      title="Payroll Runs"
      actions={
        <Button
          variant="primary"
          icon="plus"
          onClick={() => setInitiating(true)}
        >
          New Payroll Run
        </Button>
      }
    >
      <Runs key={version} />
      <InitiateRun
        open={initiating}
        onClose={() => setInitiating(false)}
        onDone={() => {
          setInitiating(false);
          setVersion((v) => v + 1);
        }}
      />
    </Page>
  );
}

const period = (r: any) =>
  dayjs(new Date(r.year, (r.month ?? 1) - 1, 1)).format("MMMM YYYY");

async function downloadBlob(url: string, name: string) {
  const res = await apiClient.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(
    new Blob([res.data], { type: "application/pdf" }),
  );
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}

function Payslips() {
  const { setAlert } = useContext(AlertContext);
  const list = usePagedList((p, l) => API_ENDPOINTS.MY_PAYSLIPS(p, l), {
    listKeys: ["payslips"],
    pageSize: 12,
  });
  const download = async (r: any, kind: "slip" | "tds") => {
    try {
      await downloadBlob(
        kind === "slip"
          ? `/generate-salary-slip/${r.userId}/${r.year}/${r.month}`
          : `/generate-tds-worksheet/${r.userId}/${r.year}/${r.month}`,
        `${kind === "slip" ? "Payslip" : "TDS_Worksheet"}_${r.year}_${String(r.month).padStart(2, "0")}.pdf`,
      );
    } catch (err) {
      setAlert({
        open: true,
        message: errorMessage(err, "The PDF couldn’t be downloaded."),
        severity: "error",
      });
    }
  };
  const latest = list.data[0];
  const columns: Column<any>[] = [
    {
      key: "period",
      header: "Period",
      priority: "primary",
      render: (r) => <span className="px-headline">{period(r)}</span>,
    },
    {
      key: "gross",
      header: "Gross",
      align: "right",
      priority: "secondary",
      stackLabel: "Gross",
      render: (r) => fmtMoney(r.grossSalary),
    },
    {
      key: "deductions",
      header: "Deductions",
      align: "right",
      priority: "hidden",
      render: (r) =>
        fmtMoney((r.pf || 0) + (r.tds || 0) + (r.advanceDeduction || 0)),
    },
    {
      key: "net",
      header: "Net Pay",
      align: "right",
      priority: "trailing",
      render: (r) => <b className="px-num">{fmtMoney(r.netPayable)}</b>,
    },
    {
      key: "dl",
      header: <span className="px-sr-only">Downloads</span>,
      align: "right",
      priority: "secondary",
      render: (r) => (
        <div
          className="px-row"
          style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}
        >
          <Button
            size="small"
            variant="plain"
            icon="download"
            onClick={() => download(r, "tds")}
          >
            TDS
          </Button>
          <Button
            size="small"
            icon="download"
            onClick={() => download(r, "slip")}
          >
            Payslip
          </Button>
        </div>
      ),
    },
  ];
  return (
    <div style={{ display: "grid", gap: 24 }}>
      {latest && (
        <div style={{ display: "grid", gap: 4 }}>
          <span className="px-meta">Latest net pay · {period(latest)}</span>
          <span
            className="px-metric"
            style={{ fontSize: 36, lineHeight: "40px" }}
          >
            {fmtMoney(latest.netPayable)}
          </span>
          <span className="px-meta">
            Gross {fmtMoney(latest.grossSalary)} · PF {fmtMoney(latest.pf)} ·
            TDS {fmtMoney(latest.tds)}
            {latest.advanceDeduction
              ? ` · Advance EMI ${fmtMoney(latest.advanceDeduction)}`
              : ""}
          </span>
        </div>
      )}
      <DataTable
        label="Payslips"
        columns={columns}
        rows={list.data}
        rowId={(r) => `${r.year}-${r.month}`}
        loading={list.loading}
        stickyOffset={52}
        empty={{
          icon: "banknote",
          title: "No payslips yet",
          body: "Payslips appear here once a payroll run that includes you is approved.",
        }}
        footer={<Pagination {...list.pageProps} />}
      />
    </div>
  );
}

const ADV_STATUSES = [
  "All",
  "Pending",
  "Approved",
  "Repaying",
  "Repaid",
  "Rejected",
] as const;

function Advances() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const approver = canApproveAdvances(user);
  const [status, setStatus] = useState<(typeof ADV_STATUSES)[number]>("All");
  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.SALARY_ADVANCES(
        p,
        l,
        `${status !== "All" ? `&status=${status}` : ""}${searchParam(q)}`,
      ),
    {
      deps: [status],
      listKeys: ["advances"],
    },
  );
  const [requesting, setRequesting] = useState(false);
  const [action, setAction] = useState<{
    id: string;
    verb: "approve" | "reject";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await apiClient.patch(API_ENDPOINTS.UPDATE_SALARY_ADVANCE_STATUS, {
        advanceId: action.id,
        action: action.verb,
      });
      setAlert({
        open: true,
        message:
          action.verb === "approve" ? "Advance approved." : "Advance rejected.",
        severity: "success",
      });
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
      render: (r) => (
        <PrimaryCell
          leading={<Avatar name={personName(r.employee || r)} size={28} />}
          title={personName(r.employee || { username: r.userId })}
          subtitle={`Requested ${fmtDate(r.createdAt)}`}
        />
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      priority: "trailing",
      render: (r) => <b className="px-num">{fmtMoney(r.amount)}</b>,
    },
    {
      key: "emi",
      header: "Repaid",
      align: "right",
      priority: "secondary",
      stackLabel: "Repaid",
      render: (r) => (
        <span className="px-num">
          {r.paidMonths ?? 0}/{r.emiMonths ?? "—"} months
        </span>
      ),
    },
    {
      key: "remaining",
      header: "Remaining",
      align: "right",
      priority: "secondary",
      stackLabel: "Left",
      render: (r) => fmtMoney(r.remainingAmount),
    },
    {
      key: "status",
      header: "Status",
      priority: "secondary",
      render: (r) => <Status value={r.status} />,
    },
    {
      key: "act",
      header: <span className="px-sr-only">Actions</span>,
      align: "right",
      priority: "secondary",
      render: (r) =>
        approver && r.status === "Pending" && r.userId !== user?.id ? (
          <div
            className="px-row"
            style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}
          >
            <Button
              size="small"
              variant="tintedDanger"
              onClick={() => setAction({ id: r.id, verb: "reject" })}
            >
              Reject
            </Button>
            <Button
              size="small"
              variant="tinted"
              onClick={() => setAction({ id: r.id, verb: "approve" })}
            >
              Approve
            </Button>
          </div>
        ) : null,
    },
  ];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="px-row" style={{ justifyContent: "space-between" }}>
        <SegmentedControl
          role="radiogroup"
          label="Status"
          value={status}
          onChange={setStatus}
          segments={ADV_STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <Button icon="plus" onClick={() => setRequesting(true)}>
          Request Advance
        </Button>
      </div>
      <DataTable
        label="Salary advances"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.id)}
        loading={list.loading}
        stickyOffset={52}
        empty={{ icon: "banknote", title: "No salary advances" }}
        footer={<Pagination {...list.pageProps} />}
      />
      <RequestAdvance
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
        title={
          action?.verb === "approve" ? "Approve Advance?" : "Reject Advance?"
        }
        description={
          action?.verb === "approve"
            ? "Repayments will be deducted from upcoming payslips."
            : "The employee will be notified."
        }
        confirmLabel={action?.verb === "approve" ? "Approve" : "Reject"}
      />
    </div>
  );
}

function RequestAdvance({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [v, setV] = useState({ amount: "", emiMonths: "3", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setV({ amount: "", emiMonths: "3", reason: "" });
      setErrors({});
    }
  }, [open]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!(Number(v.amount) > 0))
      n.amount = "Enter an amount greater than zero.";
    if (!(Number(v.emiMonths) >= 1))
      n.emiMonths = "Repay over at least one month.";
    if (!v.reason.trim()) n.reason = "Add a short reason.";
    setErrors(n);
    if (Object.keys(n).length) return;
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.REQUEST_SALARY_ADVANCE, {
        amount: Number(v.amount),
        emiMonths: Number(v.emiMonths),
        reason: v.reason.trim(),
      });
      setAlert({
        open: true,
        message: "Advance requested.",
        severity: "success",
      });
      onDone();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };
  const emi =
    Number(v.amount) > 0 && Number(v.emiMonths) > 0
      ? Number(v.amount) / Number(v.emiMonths)
      : 0;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={saving}
      title="Request Salary Advance"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="adv-form" busy={saving}>
            Submit Request
          </Button>
        </>
      }
    >
      <form id="adv-form" onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Field label="Amount (₹)" error={errors.amount}>
            <TextInput
              data-autofocus
              type="number"
              min={1}
              inputMode="numeric"
              value={v.amount}
              onChange={(e) => setV((x) => ({ ...x, amount: e.target.value }))}
            />
          </Field>
          <Field
            label="Repay Over (Months)"
            error={errors.emiMonths}
            hint={emi ? `≈ ${fmtMoney(emi)} a month` : undefined}
          >
            <TextInput
              type="number"
              min={1}
              max={24}
              inputMode="numeric"
              value={v.emiMonths}
              onChange={(e) =>
                setV((x) => ({ ...x, emiMonths: e.target.value }))
              }
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

const RUN_STATUSES = [
  "All",
  "draft",
  "processing",
  "approved",
  "disbursing",
  "disbursed",
  "disbursement_failed",
  "cancelled",
];
const runLabel = (s?: string) =>
  s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ") : "—";

type RunAction = {
  id: string;
  status:
    | "processing"
    | "approved"
    | "disbursed"
    | "cancelled"
    | "retry-payouts";
  period: string;
};
const ACTION_COPY: Record<
  RunAction["status"],
  { label: string; title: string; body: string; tone: "accent" | "danger" }
> = {
  processing: {
    label: "Submit for Approval",
    title: "Submit Run for Approval?",
    body: "Salaries are frozen for review.",
    tone: "accent",
  },
  approved: {
    label: "Approve",
    title: "Approve Payroll Run?",
    body: "Once approved, the run can be disbursed.",
    tone: "accent",
  },
  disbursed: {
    label: "Disburse",
    title: "Disburse Salaries?",
    body: "Payouts are sent to every employee in this run, payslips are generated, and employees are notified. This can’t be undone.",
    tone: "danger",
  },
  "retry-payouts": {
    label: "Retry Payouts",
    title: "Retry Failed Payouts?",
    body: "Only payouts that haven’t succeeded are retried.",
    tone: "accent",
  },
  cancelled: {
    label: "Cancel Run",
    title: "Cancel Payroll Run?",
    body: "The run is discarded. You can start a new one for this period.",
    tone: "danger",
  },
};

function Runs() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [status, setStatus] = useState("All");
  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.PAYROLL_RUNS(
        p,
        l,
        `${status !== "All" ? `&status=${status}` : ""}${searchParam(q)}`,
      ),
    { listKeys: ["runs"], pageSize: 12, deps: [status] },
  );
  const [action, setAction] = useState<RunAction | null>(null);
  const [busy, setBusy] = useState(false);
  const polls = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = polls.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // Disbursement runs in a background worker; poll the run (as Classic does)
  // until it settles, then report the outcome.
  const pollUntilSettled = (runId: string, attempt = 0) => {
    clearTimeout(polls.current.get(runId));
    if (attempt >= 40) return;
    polls.current.set(
      runId,
      setTimeout(async () => {
        try {
          const res = await apiClient.get(API_ENDPOINTS.GET_PAYROLL_RUN(runId));
          const s = res.data?.data?.status;
          if (s === "disbursing") return pollUntilSettled(runId, attempt + 1);
          list.refresh();
          setAlert({
            open: true,
            message:
              s === "disbursed"
                ? "Payroll disbursed. Payslips generated and employees notified."
                : "Some payouts failed. Retry them from the run.",
            severity: s === "disbursed" ? "success" : "error",
          });
        } catch {
          /* stop polling quietly */
        }
      }, 3000),
    );
  };

  const run = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.status === "retry-payouts") {
        const res = await apiClient.post(
          API_ENDPOINTS.RETRY_PAYROLL_PAYOUTS(action.id),
        );
        setAlert({
          open: true,
          message: res.data?.message || "Retrying outstanding payouts.",
          severity: "info",
        });
        pollUntilSettled(action.id);
      } else {
        const res = await apiClient.patch(
          API_ENDPOINTS.UPDATE_PAYROLL_RUN_STATUS,
          { runId: action.id, status: action.status },
        );
        if (action.status === "disbursed") {
          setAlert({
            open: true,
            message:
              res.data?.message ||
              "Disbursement started. Large runs can take a few minutes.",
            severity: "info",
          });
          pollUntilSettled(action.id);
        } else {
          setAlert({
            open: true,
            message: `${action.period}: ${ACTION_COPY[action.status].label.toLowerCase()} done.`,
            severity: "success",
          });
        }
      }
      setAction(null);
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const actionsFor = (r: any): RunAction["status"][] => {
    if (!isHrOrAbove(user)) return [];
    if (r.status === "draft") return ["cancelled", "processing"];
    if (r.status === "processing") return ["cancelled", "approved"];
    if (r.status === "approved") return ["disbursed"];
    if (["disbursed", "disbursement_failed"].includes(r.status))
      return ["retry-payouts"];
    return [];
  };

  const columns: Column<any>[] = [
    {
      key: "period",
      header: "Period",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          title={period(r)}
          subtitle={`Started ${fmtDate(r.createdAt)}`}
        />
      ),
    },
    {
      key: "emp",
      header: "Employees",
      align: "right",
      priority: "secondary",
      stackLabel: "People",
      render: (r) => <span className="px-num">{r.employeeCount ?? "—"}</span>,
    },
    {
      key: "gross",
      header: "Total Gross",
      align: "right",
      priority: "hidden",
      render: (r) => fmtMoney(r.totalGross),
    },
    {
      key: "net",
      header: "Total Net",
      align: "right",
      priority: "secondary",
      stackLabel: "Net",
      render: (r) => <b className="px-num">{fmtMoney(r.totalNet)}</b>,
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => <Status value={runLabel(r.status)} />,
    },
    {
      key: "act",
      header: <span className="px-sr-only">Actions</span>,
      align: "right",
      priority: "secondary",
      render: (r) => (
        <div
          className="px-row"
          style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}
        >
          {actionsFor(r).map((st) => (
            <Button
              key={st}
              size="small"
              variant={
                st === "cancelled"
                  ? "plain"
                  : st === "disbursed"
                    ? "primary"
                    : "tinted"
              }
              onClick={() =>
                setAction({ id: r.id, status: st, period: period(r) })
              }
            >
              {ACTION_COPY[st].label}
            </Button>
          ))}
        </div>
      ),
    },
  ];
  const copy = action ? ACTION_COPY[action.status] : null;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <SegmentedControl
        role="radiogroup"
        label="Status"
        value={status}
        onChange={setStatus}
        segments={RUN_STATUSES.map((s) => ({
          value: s,
          label: s === "All" ? "All" : runLabel(s),
        }))}
      />
      <DataTable
        label="Payroll runs"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.id)}
        loading={list.loading}
        stickyOffset={52}
        empty={{
          icon: "banknote",
          title: "No payroll runs yet",
          body: "Start a run for a month to calculate everyone’s salary.",
        }}
        footer={<Pagination {...list.pageProps} />}
      />
      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        onConfirm={run}
        busy={busy}
        tone={copy?.tone}
        title={copy?.title ?? ""}
        description={action ? `${action.period}. ${copy?.body}` : undefined}
        confirmLabel={copy?.label ?? ""}
      />
    </div>
  );
}

function InitiateRun({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const prev = dayjs().subtract(1, "month");
  const [month, setMonth] = useState(prev.format("YYYY-MM"));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setMonth(dayjs().subtract(1, "month").format("YYYY-MM"));
  }, [open]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const [y, m] = month.split("-").map(Number);
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.INITIATE_PAYROLL_RUN, {
        month: m,
        year: y,
      });
      setAlert({
        open: true,
        message: `Payroll run started for ${dayjs(month).format("MMMM YYYY")}.`,
        severity: "success",
      });
      onDone();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={saving}
      size="sm"
      title="New Payroll Run"
      description="Salaries are calculated from each employee’s structure and attendance for the month."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="run-form" busy={saving}>
            Start Run
          </Button>
        </>
      }
    >
      <form id="run-form" onSubmit={submit}>
        <Field label="Month">
          <TextInput
            data-autofocus
            type="month"
            max={dayjs().format("YYYY-MM")}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}
