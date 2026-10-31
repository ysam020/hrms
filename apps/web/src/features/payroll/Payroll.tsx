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
  Card,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  FormGrid,
  Page,
  Pagination,
  PrimaryCell,
  Section,
  SegmentedControl,
  Skeleton,
  Status,
  StatusBadge,
  TextArea,
  TextInput,
  Icon,
  fieldSpan2,
  type Column,
  type Tone,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import s from "./salary.module.css";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fmtMoney, personName } from "@next/lib/format";

// Payroll pages — one per sidebar entry. Visibility uses Classic's own rules
// (isHrOrAbove, canManageSalary, canApproveAdvances) in navigation.ts/router.tsx.

export function PayslipsPage() {
  return (
    <Page
      title="My Payslips"
      description="Your monthly salary statements and TDS worksheets, newest first."
    >
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
      description="Each run calculates a month’s salaries. It’s reviewed and approved before anyone is paid."
      actions={
        <Button
          data-tour="runs-new"
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
      priority: "secondary",
      stackLabel: "Deductions",
      render: (r) => (
        <span className="px-secondary">
          {fmtMoney((r.pf || 0) + (r.tds || 0) + (r.advanceDeduction || 0))}
        </span>
      ),
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
            aria-label={`Download TDS worksheet for ${period(r)}`}
          >
            TDS Worksheet
          </Button>
          <Button
            size="small"
            variant="tinted"
            icon="download"
            onClick={() => download(r, "slip")}
            aria-label={`Download payslip for ${period(r)}`}
          >
            Payslip
          </Button>
        </div>
      ),
    },
  ];
  return (
    <div style={{ display: "grid", gap: 28 }}>
      {latest ? (
        <LatestPayslip
          r={latest}
          onDownload={(kind) => download(latest, kind)}
        />
      ) : list.loading ? (
        <Card>
          <div style={{ display: "grid", gap: 10 }}>
            <Skeleton width={140} />
            <Skeleton width={200} height={36} />
            <Skeleton height={10} radius={5} />
          </div>
        </Card>
      ) : null}
      <Section
        title="History"
        detail={
          list.data.length
            ? "Payslips and TDS worksheets are PDFs you can download any time."
            : undefined
        }
      >
        <DataTable
          label="Payslips"
          tour="payslips-table"
          columns={columns}
          rows={list.data}
          rowId={(r) => `${r.year}-${r.month}`}
          loading={list.loading}
          stickyOffset={52}
          empty={{
            icon: "banknote",
            title: "No payslips yet",
            body: "Payslips appear here once a payroll run that includes you is disbursed.",
          }}
          footer={<Pagination {...list.pageProps} />}
        />
      </Section>
    </div>
  );
}

/** The most recent payslip: net pay first, then where gross pay went. */
function LatestPayslip({
  r,
  onDownload,
}: {
  r: any;
  onDownload: (kind: "slip" | "tds") => Promise<void>;
}) {
  const gross = Number(r.grossSalary) || 0;
  const parts = [
    { label: "PF", value: Number(r.pf) || 0 },
    { label: "TDS", value: Number(r.tds) || 0 },
    { label: "Advance EMI", value: Number(r.advanceDeduction) || 0 },
  ];
  const deductions = parts.reduce((a, p) => a + p.value, 0);
  const net = Number(r.netPayable) || 0;
  return (
    <Card>
      <div className={s.payslip}>
        <div className={s.payslipHead}>
          <div style={{ display: "grid", gap: 2 }}>
            <span className="px-label px-secondary">
              Latest payslip · {period(r)}
            </span>
            <span className={s.netPay}>{fmtMoney(net)}</span>
            <span className="px-meta">Take-home after deductions</span>
          </div>
          <div className={s.payslipActions}>
            <Button
              variant="primary"
              icon="download"
              onClick={() => onDownload("slip")}
            >
              Download Payslip
            </Button>
            <Button icon="download" onClick={() => onDownload("tds")}>
              TDS Worksheet
            </Button>
          </div>
        </div>
        <div
          className={s.payBar}
          role="img"
          aria-label={`Of ${fmtMoney(gross)} gross, ${fmtMoney(deductions)} deducted and ${fmtMoney(net)} paid`}
        >
          <span
            className={s.payBarNet}
            style={{ flexGrow: Math.max(net, 0) || 1 }}
          />
          {deductions > 0 && (
            <span className={s.payBarDeduct} style={{ flexGrow: deductions }} />
          )}
        </div>
        <dl className={s.payFigures}>
          <div>
            <dt>Gross Pay</dt>
            <dd className="px-num">{fmtMoney(gross)}</dd>
          </div>
          <div data-kind="deduct">
            <dt>Deductions</dt>
            <dd className="px-num">− {fmtMoney(deductions)}</dd>
            <dd className="px-meta">
              {parts
                .filter((p) => p.value > 0 || p.label !== "Advance EMI")
                .map((p) => `${p.label} ${fmtMoney(p.value)}`)
                .join(" · ")}
            </dd>
          </div>
          <div data-kind="net">
            <dt>Net Pay</dt>
            <dd className="px-num">{fmtMoney(net)}</dd>
          </div>
        </dl>
      </div>
    </Card>
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
        <Button
          data-tour="advances-request"
          icon="plus"
          onClick={() => setRequesting(true)}
        >
          Request Advance
        </Button>
      </div>
      <DataTable
        label="Salary advances"
        tour="advances-table"
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
/** Run states have their own meaning, so they get an explicit tone. */
const RUN_TONE: Record<string, Tone> = {
  draft: "neutral",
  processing: "warning",
  approved: "accent",
  disbursing: "warning",
  disbursed: "success",
  disbursement_failed: "danger",
  cancelled: "neutral",
};
const RunStatus = ({ status }: { status?: string }) => (
  <StatusBadge tone={RUN_TONE[status ?? ""] ?? "neutral"}>
    {runLabel(status)}
  </StatusBadge>
);
/** The happy path, for the latest run's progress track. */
const RUN_TRACK = [
  { key: "draft", label: "Draft" },
  { key: "processing", label: "In Review" },
  { key: "approved", label: "Approved" },
  { key: "disbursed", label: "Disbursed" },
];
const trackIndex = (status: string) =>
  status === "disbursing" || status === "disbursement_failed"
    ? 3
    : RUN_TRACK.findIndex((t) => t.key === status);

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
      priority: "secondary",
      stackLabel: "Gross",
      render: (r) => (
        <span className="px-num px-secondary">{fmtMoney(r.totalGross)}</span>
      ),
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
      render: (r) => <RunStatus status={r.status} />,
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
  const latest = status === "All" && !list.query ? list.data[0] : null;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      {latest && (
        <Card>
          <div className={s.runCard}>
            <div className={s.runHead}>
              <div style={{ display: "grid", gap: 2 }}>
                <span className="px-label px-secondary">Latest run</span>
                <span className="px-title">{period(latest)}</span>
                <span className="px-meta">
                  Started {fmtDate(latest.createdAt)}
                </span>
              </div>
              <RunStatus status={latest.status} />
            </div>
            {latest.status !== "cancelled" && (
              <ol className={s.stages} aria-label="Run progress">
                {RUN_TRACK.map((st, i) => {
                  const at = trackIndex(latest.status);
                  const failed =
                    latest.status === "disbursement_failed" && i === 3;
                  const state =
                    latest.status === "disbursed" || i < at
                      ? "done"
                      : i === at
                        ? "current"
                        : "upcoming";
                  return (
                    <li
                      key={st.key}
                      data-state={state}
                      data-failed={failed || undefined}
                      aria-current={state === "current" ? "step" : undefined}
                    >
                      <span className={s.stageDot} aria-hidden>
                        {state === "done" ? (
                          <Icon name="check" size={12} />
                        ) : failed ? (
                          <Icon name="alert" size={12} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      {failed
                        ? "Payouts Failed"
                        : latest.status === "disbursing" && i === 3
                          ? "Disbursing…"
                          : st.label}
                    </li>
                  );
                })}
              </ol>
            )}
            <dl className={s.runFigures}>
              <div>
                <dt>Employees</dt>
                <dd className="px-num">{latest.employeeCount ?? "—"}</dd>
              </div>
              <div>
                <dt>Total Gross</dt>
                <dd className="px-num">{fmtMoney(latest.totalGross)}</dd>
              </div>
              <div>
                <dt>Total Net</dt>
                <dd className="px-num">{fmtMoney(latest.totalNet)}</dd>
              </div>
            </dl>
            {actionsFor(latest).length > 0 && (
              <div className="px-row" style={{ justifyContent: "flex-end" }}>
                {actionsFor(latest).map((st) => (
                  <Button
                    key={st}
                    variant={
                      st === "cancelled"
                        ? "plain"
                        : st === "retry-payouts" &&
                            latest.status === "disbursed"
                          ? "secondary"
                          : "primary"
                    }
                    onClick={() =>
                      setAction({
                        id: latest.id,
                        status: st,
                        period: period(latest),
                      })
                    }
                  >
                    {ACTION_COPY[st].label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
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
        tour="runs-table"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.id)}
        loading={list.loading}
        stickyOffset={52}
        empty={
          status === "All"
            ? {
                icon: "banknote",
                title: "No payroll runs yet",
                body: "Start a run for a month to calculate everyone’s salary.",
              }
            : {
                icon: "banknote",
                title: `No ${runLabel(status).toLowerCase()} runs`,
                body: "Runs move from Draft through In Review and Approved to Disbursed.",
              }
        }
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
