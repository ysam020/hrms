import dayjs from "dayjs";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { leaveSchema } from "@web/shared/schemas/leave";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import useFetchData from "@web/shared/hooks/useFetchData";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";
import { Collapse, useTransitionNavigate } from "@next/motion";
import {
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  Field,
  FileField,
  FormGrid,
  Metric,
  Metrics,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  SegmentedControl,
  Select,
  Sheet,
  Status,
  Switch,
  TextArea,
  TextInput,
  UserCombobox,
  fieldSpan2,
  inlineCheckClass,
  type Column,
} from "@next/ui";
import { PENDING_UPLOAD } from "@next/ui/FileField";
import { DraftNote, sendOrQueue, useOfflineDraft } from "@next/offline";
import { apiClient, errorMessage, isCanceled } from "@next/lib/api";
import { useGet, useIsCompact } from "@next/lib/hooks";
import { fmtDate, fmtTime, personName } from "@next/lib/format";

// Attendance & Leave pages (one per sidebar entry, Classic's paths):
//   /attendance                          My Attendance
//   /attendance/view-all-attendances     All Attendance
//   /attendance/attendance-correction    Corrections
//   /attendance/view-leave-applications  Leave Applications
//   /attendance/apply-leave              Apply for Leave

export function MyAttendancePage() {
  return (
    <Page title="My Attendance">
      <MyMonth />
    </Page>
  );
}

export function AllAttendancePage() {
  return (
    <Page title="All Attendance">
      <TeamAttendance />
    </Page>
  );
}

export function CorrectionsPage() {
  return (
    <Page title="Attendance Corrections" width="reading">
      <Correction />
    </Page>
  );
}

export function LeaveApplicationsPage() {
  const navigate = useTransitionNavigate();
  return (
    <Page
      title="Leave Applications"
      actions={
        <Button
          variant="primary"
          icon="plus"
          onClick={() => navigate("/attendance/apply-leave")}
        >
          Apply for Leave
        </Button>
      }
    >
      <LeaveApplications />
    </Page>
  );
}

export function ApplyLeavePage() {
  const navigate = useTransitionNavigate();
  return (
    <Page
      title="Apply for Leave"
      width="reading"
      back={{
        to: "/attendance/view-leave-applications",
        label: "Leave Applications",
      }}
    >
      <ApplyLeave
        inline
        open
        onClose={() => navigate(-1)}
        onApplied={() => navigate("/attendance/view-leave-applications")}
      />
    </Page>
  );
}

// ── My month ────────────────────────────────────────────────────────────────

function MyMonth() {
  const { user } = useContext(UserContext);
  const [month, setMonth] = useState(() => dayjs().startOf("month"));
  const y = month.year();
  const m = month.month() + 1;
  const records = useGet<any[]>(API_ENDPOINTS.GET_EMPLOYEE_ATTENDANCE(y, m));
  const summary = useGet<any>(
    user?.id ? API_ENDPOINTS.GET_ATTENDANCE_SUMMARY(user.id, y, m) : null,
  );
  const rows = useMemo(
    () =>
      (Array.isArray(records.data) ? records.data : [])
        .slice()
        .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf()),
    [records.data],
  );
  const sm = summary.data || {};
  const tIn = (r: any) => r.checkIn ?? r.timeIn;
  const tOut = (r: any) => r.checkOut ?? r.timeOut;

  const columns: Column<any>[] = [
    {
      key: "date",
      header: "Date",
      priority: "primary",
      render: (r) => (
        <span className="px-headline">
          {dayjs(r.date).format("ddd, D MMM")}
        </span>
      ),
    },
    {
      key: "in",
      header: "In",
      priority: "secondary",
      stackLabel: "In",
      render: (r) => (
        <span className="px-num">{tIn(r) ? fmtTime(tIn(r)) : "—"}</span>
      ),
    },
    {
      key: "out",
      header: "Out",
      priority: "secondary",
      stackLabel: "Out",
      render: (r) => (
        <span className="px-num">{tOut(r) ? fmtTime(tOut(r)) : "—"}</span>
      ),
    },
    {
      key: "hours",
      header: "Hours",
      align: "right",
      priority: "secondary",
      render: (r) => {
        if (!tIn(r) || !tOut(r)) return "—";
        const mins = dayjs(tOut(r)).diff(dayjs(tIn(r)), "minute");
        return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
      },
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => (
        <Status
          value={
            r.status
              ? r.status[0].toUpperCase() + r.status.slice(1)
              : tIn(r)
                ? "Present"
                : null
          }
        />
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 32 }}>
      <div className="px-row" style={{ justifyContent: "space-between" }}>
        <div className="px-row">
          <Button
            size="small"
            icon="chevronLeft"
            onClick={() => setMonth((d) => d.subtract(1, "month"))}
            aria-label="Previous month"
          />
          <h2
            className="px-section"
            style={{ minWidth: 150, textAlign: "center" }}
            aria-live="polite"
          >
            {month.format("MMMM YYYY")}
          </h2>
          <Button
            size="small"
            icon="chevronRight"
            onClick={() => setMonth((d) => d.add(1, "month"))}
            disabled={month.isSame(dayjs(), "month")}
            aria-label="Next month"
          />
        </div>
      </div>
      <Metrics label="Month summary">
        <Metric
          label="Present"
          value={sm.presents ?? "—"}
          loading={summary.loading}
        />
        <Metric
          label="Half Days"
          value={sm.halfDays ?? "—"}
          loading={summary.loading}
        />
        <Metric
          label="Paid Leave"
          value={sm.paidLeaves ?? "—"}
          loading={summary.loading}
        />
        <Metric
          label="Unpaid Leave"
          value={sm.unpaidLeaves ?? "—"}
          loading={summary.loading}
        />
        <Metric
          label="Corrections Left"
          value={sm.remainingCorrections ?? "—"}
          note={
            sm.maxCorrectionsPerMonth
              ? `of ${sm.maxCorrectionsPerMonth}`
              : undefined
          }
          loading={summary.loading}
        />
      </Metrics>
      <DataTable
        label={`Attendance for ${month.format("MMMM YYYY")}`}
        columns={columns}
        rows={rows}
        rowId={(r) => String(r._id || r.id || r.date)}
        loading={records.loading}
        error={records.error}
        onRetry={records.refetch}
        stickyOffset={52}
        empty={{
          icon: "clock",
          title: "No attendance recorded",
          body: "Punch in from Today to start your record.",
        }}
      />
    </div>
  );
}

// ── Leave applications ──────────────────────────────────────────────────────

const STATUSES = [
  "All",
  "Pending",
  "Approved",
  "Rejected",
  "Cancelled",
] as const;

function LeaveApplications() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Pending");
  const [futureOnly, setFutureOnly] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // On phones, rows carry no checkbox until the manager chooses Select (an
  // edit mode, as in iOS lists); wider screens keep the always-available
  // checkbox column.
  const compact = useIsCompact();
  const [selecting, setSelecting] = useState(false);
  const [action, setAction] = useState<{
    ids: string[];
    verb: "approve" | "reject" | "cancel";
    label: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Same rule as Classic: owners/admins, or Leave:approve at team/all scope;
  // people can't act on their own requests (superusers excepted).
  const canManage =
    isOwnerOrAdmin(user) ||
    hasPermission(
      "Leave",
      "approve",
      "all",
      user?.isSuperUser,
      user?.permissions || [],
    ) ||
    hasPermission(
      "Leave",
      "approve",
      "team",
      user?.isSuperUser,
      user?.permissions || [],
    );
  const canActOn = (r: any) =>
    canManage && (user?.isSuperUser || r.userId !== user?.id);

  const fetchPage = useCallback(
    async ({ page, limit }: { page: number; limit: number }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status,
        futureOnly: String(futureOnly),
      });
      if (searchRef.current) params.set("search", searchRef.current);
      try {
        const res = await apiClient.get(
          API_ENDPOINTS.GET_LEAVE_APPLICATIONS(params.toString()),
        );
        const d = res.data;
        const records = d.data?.records ?? d.data ?? [];
        return {
          data: records,
          totalCount:
            d.data?.pagination?.totalCount ?? d.total ?? records.length,
        };
      } catch (err) {
        if (!isCanceled(err))
          setAlert({
            open: true,
            message: "Leave applications couldn’t be loaded. Try again.",
            severity: "error",
          });
        throw err;
      }
    },
    [status, futureOnly, setAlert],
  );
  const list = useServerPagination(fetchPage, {
    initialPageSize: 25,
    deps: [status, futureOnly],
  });
  useEffect(() => setSelected(new Set()), [list.data]);
  useEffect(() => setSelecting(false), [status]);

  const onSearch = (v: string) => {
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      searchRef.current = v.trim();
      list.resetPagination();
    }, 300);
  };

  const confirm = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.ids.length === 1) {
        const res = await apiClient.put(API_ENDPOINTS.UPDATE_LEAVE_STATUS, {
          leaveId: action.ids[0],
          action: action.verb,
        });
        if (!res.data?.success)
          throw new Error(
            res.data?.message || "The request couldn’t be updated.",
          );
        setAlert({
          open: true,
          message: res.data.message || "Leave updated.",
          severity: "success",
        });
      } else {
        const res = await apiClient.put(
          API_ENDPOINTS.BULK_UPDATE_LEAVE_STATUS,
          { leaveIds: action.ids, action: action.verb },
        );
        const failed = res.data?.data?.failed ?? [];
        const ok = res.data?.data?.succeeded ?? [];
        setAlert({
          open: true,
          message: failed.length
            ? `${ok.length} updated, ${failed.length} failed.`
            : res.data?.message || `${ok.length} updated.`,
          severity: failed.length ? "warning" : "success",
        });
        setSelecting(false);
      }
      setAction(null);
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const rowActions = (r: any) => {
    const id = String(r.id || r._id);
    const own = r.userId === user?.id;
    return (
      <div
        className="px-row"
        style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}
        onClick={(e) => e.stopPropagation()}
      >
        {r.status === "Pending" && canActOn(r) && (
          <>
            <Button
              size="small"
              variant="tintedDanger"
              onClick={() =>
                setAction({ ids: [id], verb: "reject", label: "Reject" })
              }
            >
              Reject
            </Button>
            <Button
              size="small"
              variant="tinted"
              onClick={() =>
                setAction({ ids: [id], verb: "approve", label: "Approve" })
              }
            >
              Approve
            </Button>
          </>
        )}
        {own && ["Pending", "Approved"].includes(r.status) && (
          <Button
            size="small"
            variant="plain"
            onClick={() =>
              setAction({ ids: [id], verb: "cancel", label: "Withdraw" })
            }
          >
            Withdraw
          </Button>
        )}
      </div>
    );
  };

  const columns: Column<any>[] = [
    {
      key: "who",
      header: "Employee",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          leading={<Avatar name={personName(r)} size={28} />}
          title={personName(r)}
          subtitle={
            r.leaveType
              ? `${r.leaveType}${r.unit && r.unit !== "full_day" ? ` · ${r.unit === "half_day" ? "Half day" : "Short leave"}` : ""}`
              : undefined
          }
        />
      ),
    },
    {
      key: "dates",
      header: "Dates",
      priority: "secondary",
      render: (r) => (
        <span className="px-num">
          {fmtDate(r.from)}
          {r.to && !dayjs(r.to).isSame(r.from, "day")
            ? ` – ${fmtDate(r.to)}`
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
      render: rowActions,
    },
  ];

  const pendingSelectable = list.data.filter(
    (r: any) => r.status === "Pending" && canActOn(r),
  );
  const canBulk =
    canManage && status === "Pending" && pendingSelectable.length > 1;
  const showSelection = canBulk && (!compact || selecting);
  const endSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="px-row" style={{ justifyContent: "space-between" }}>
        <SegmentedControl
          role="radiogroup"
          label="Status"
          value={status}
          onChange={setStatus}
          segments={STATUSES.map((s) => ({ value: s, label: s }))}
        />
        {compact && canBulk && (
          <Button
            size="small"
            variant="plain"
            aria-pressed={selecting}
            onClick={() => (selecting ? endSelecting() : setSelecting(true))}
          >
            {selecting ? "Done" : "Select"}
          </Button>
        )}
        <div className="px-row">
          <label className={inlineCheckClass}>
            <Switch
              checked={futureOnly}
              onChange={setFutureOnly}
              label="Upcoming only"
            />
            Upcoming only
          </label>
          <SearchField
            label="Search people"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            toolbarWidth={220}
          />
        </div>
      </div>
      <DataTable
        label="Leave applications"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.id || r._id)}
        loading={list.loading}
        stickyOffset={52}
        selected={showSelection ? selected : undefined}
        onSelectedChange={setSelected}
        bulkActions={
          <>
            <Button
              size="small"
              variant="tintedDanger"
              onClick={() =>
                setAction({
                  ids: [...selected],
                  verb: "reject",
                  label: "Reject",
                })
              }
            >
              Reject
            </Button>
            <Button
              size="small"
              variant="primary"
              onClick={() =>
                setAction({
                  ids: [...selected],
                  verb: "approve",
                  label: "Approve",
                })
              }
            >
              Approve
            </Button>
          </>
        }
        empty={{
          icon: "leave",
          title:
            status === "All"
              ? "No leave applications"
              : `No ${status.toLowerCase()} applications`,
        }}
        footer={
          <Pagination
            page={list.currentPage}
            pageSize={list.pageSize}
            total={list.totalCount}
            onPage={(p) => list.goToPage(p - 1)}
          />
        }
      />
      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        onConfirm={confirm}
        busy={busy}
        tone={action?.verb === "approve" ? "accent" : "danger"}
        title={
          action
            ? `${action.label} ${action.ids.length > 1 ? `${action.ids.length} Applications` : "Leave"}?`
            : ""
        }
        description={
          action?.verb === "cancel"
            ? "Your leave request will be withdrawn."
            : "The employee will be notified."
        }
        confirmLabel={action?.label ?? ""}
      />
    </div>
  );
}

// ── Team attendance ─────────────────────────────────────────────────────────

function TeamAttendance() {
  const { setAlert } = useContext(AlertContext);
  const [month, setMonth] = useState(() => dayjs().format("YYYY-MM"));
  const [query, setQuery] = useState("");
  const searchRef = useRef("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchPage = useCallback(
    async ({ page, limit }: { page: number; limit: number }) => {
      const [y, m] = month.split("-").map(Number);
      const base = API_ENDPOINTS.GET_ALL_ATTENDANCES(y, m, page, limit);
      try {
        const res = await apiClient.get(
          searchRef.current
            ? `${base}&search=${encodeURIComponent(searchRef.current)}`
            : base,
        );
        return {
          data: res.data?.data?.records ?? [],
          totalCount: res.data?.data?.pagination?.totalCount ?? 0,
        };
      } catch (err) {
        if (!isCanceled(err))
          setAlert({
            open: true,
            message: errorMessage(err),
            severity: "error",
          });
        throw err;
      }
    },
    [month, setAlert],
  );
  const list = useServerPagination(fetchPage, {
    initialPageSize: 25,
    deps: [month],
  });
  const onSearch = (v: string) => {
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      searchRef.current = v.trim();
      list.resetPagination();
    }, 300);
  };
  const num = (k: string) => (r: any) => (
    <span className="px-num">{r[k] ?? 0}</span>
  );
  const columns: Column<any>[] = [
    {
      key: "who",
      header: "Employee",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          leading={<Avatar name={personName(r)} size={28} />}
          title={personName(r)}
          subtitle={r.username}
        />
      ),
    },
    {
      key: "presents",
      header: "Present",
      align: "right",
      priority: "trailing",
      render: num("presents"),
    },
    {
      key: "halfDays",
      header: "Half Days",
      align: "right",
      priority: "secondary",
      stackLabel: "Half",
      render: num("halfDays"),
    },
    {
      key: "paidLeaves",
      header: "Paid Leave",
      align: "right",
      priority: "secondary",
      stackLabel: "PL",
      render: num("paidLeaves"),
    },
    {
      key: "unpaidLeaves",
      header: "Unpaid",
      align: "right",
      priority: "secondary",
      stackLabel: "LWP",
      render: num("unpaidLeaves"),
    },
    {
      key: "correctionsUsed",
      header: "Corrections",
      align: "right",
      priority: "hidden",
      render: num("correctionsUsed"),
    },
  ];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="px-row" style={{ gap: 8 }}>
        <TextInput
          type="month"
          value={month}
          max={dayjs().format("YYYY-MM")}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Month"
          style={{ width: 180 }}
        />
        <SearchField
          label="Search people"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          toolbarWidth={240}
        />
      </div>
      <DataTable
        label="Team attendance"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.userId || r.username)}
        loading={list.loading}
        stickyOffset={52}
        empty={{
          icon: "people",
          title: "No attendance records for this month",
        }}
        footer={
          <Pagination
            page={list.currentPage}
            pageSize={list.pageSize}
            total={list.totalCount}
            onPage={(p) => list.goToPage(p - 1)}
          />
        }
      />
    </div>
  );
}

// ── Correction ──────────────────────────────────────────────────────────────

function Correction() {
  const { setAlert } = useContext(AlertContext);
  const [values, setValues] = useState({ userId: "", timeIn: "", timeOut: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!values.userId) next.userId = "Choose an employee.";
    if (!values.timeIn) next.timeIn = "Enter the time in.";
    if (
      values.timeIn &&
      values.timeOut &&
      dayjs(values.timeOut).isBefore(values.timeIn)
    )
      next.timeOut = "Time out must be after time in.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const res = await apiClient.put(
        API_ENDPOINTS.ATTENDANCE_CORRECTION,
        values,
      );
      setAlert({
        open: true,
        message: res.data?.message || "Attendance corrected.",
        severity: "success",
      });
      setValues({ userId: "", timeIn: "", timeOut: "" });
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      style={{ maxWidth: 560, display: "grid", gap: 20 }}
    >
      <p className="px-secondary">
        Correct a missed or wrong punch. Each correction counts toward the
        employee’s monthly allowance.
      </p>
      <FormGrid columns={2}>
        <Field label="Employee" error={errors.userId} className={fieldSpan2}>
          <UserCombobox
            value={values.userId}
            onChange={(userId) => setValues((v) => ({ ...v, userId }))}
          />
        </Field>
        <Field label="Time In" error={errors.timeIn}>
          <TextInput
            type="datetime-local"
            value={values.timeIn}
            onChange={(e) =>
              setValues((v) => ({ ...v, timeIn: e.target.value }))
            }
          />
        </Field>
        <Field label="Time Out" optional error={errors.timeOut}>
          <TextInput
            type="datetime-local"
            value={values.timeOut}
            onChange={(e) =>
              setValues((v) => ({ ...v, timeOut: e.target.value }))
            }
          />
        </Field>
      </FormGrid>
      <div>
        <Button type="submit" variant="primary" busy={saving}>
          Save Correction
        </Button>
      </div>
    </form>
  );
}

// ── Apply for leave ─────────────────────────────────────────────────────────

const EMPTY: {
  from: string;
  to: string;
  reason: string;
  leaveType: string;
  sick_leave: boolean;
  medicalCertificate: string;
  unit: string;
  session: string;
  shortLeaveHours: string;
} = {
  from: "",
  to: "",
  reason: "",
  leaveType: "PL",
  sick_leave: false,
  medicalCertificate: "",
  unit: "full_day",
  session: "",
  shortLeaveHours: "",
};

export function ApplyLeave({
  open,
  onClose,
  onApplied,
  inline,
}: {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
  /** Render as page content instead of a sheet. */
  inline?: boolean;
}) {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Kept on this device as it's filled in; restored if the sheet is reopened
  // or the app restarts before it's sent.
  const draft = useOfflineDraft({
    formKey: "leave.apply",
    values,
    setValues,
    initial: EMPTY,
    enabled: open,
  });
  const { data: org } = useFetchData<any>(
    open ? API_ENDPOINTS.GET_ORG_SETTINGS : null,
    "get",
    [user, open],
    null,
    null,
  );

  useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setErrors({});
    }
  }, [open]);
  useEffect(() => {
    if (values.unit !== "full_day" && values.from)
      setValues((v) => ({ ...v, to: v.from }));
  }, [values.unit, values.from]);

  // Same leave-type list as Classic: statutory defaults + the org's policy.
  const types = useMemo(() => {
    const seen = new Map<string, string>();
    const add = (v?: string, l?: string) => {
      const k = v?.trim().toUpperCase();
      if (k && !seen.has(k)) seen.set(k, l?.trim() || k);
    };
    add("PL", "Paid Leave");
    add("SL", "Sick Leave");
    add("CL", "Casual Leave");
    add("MATERNITY", "Maternity Leave");
    add("PATERNITY", "Paternity Leave");
    (org?.active?.customLeaveTypes ?? []).forEach((t: any) =>
      add(t.key, t.name),
    );
    (org?.active?.leavePolicies ?? []).forEach((p: any) =>
      add(p.key, p.isCompOff ? `${p.name} (Comp Off)` : p.name),
    );
    add("LWP", "Leave Without Pay");
    return [...seen.entries()];
  }, [org]);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: "" }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const candidate = {
      ...values,
      session: values.session || undefined,
      shortLeaveHours: values.shortLeaveHours
        ? Number(values.shortLeaveHours)
        : undefined,
    };
    const parsed = leaveSchema.safeParse(candidate);
    const next: Record<string, string> = {};
    if (!parsed.success)
      for (const i of parsed.error.issues)
        next[String(i.path[0])] ??= i.message;
    if (values.reason.trim().length > 0 && values.reason.trim().length < 5)
      next.reason ??= "Use at least 5 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      // A certificate chosen offline is uploaded first, then its URL is sent.
      const cert = values.medicalCertificate;
      const pendingCert = cert.startsWith(PENDING_UPLOAD)
        ? cert.slice(PENDING_UPLOAD.length)
        : null;
      const result = await sendOrQueue({
        kind: "leave.create",
        label: `Leave request · ${fmtDate(values.from)}${
          values.to && values.to !== values.from
            ? ` – ${fmtDate(values.to)}`
            : ""
        }`,
        method: "POST",
        url: API_ENDPOINTS.ADD_LEAVE,
        body: {
          ...candidate,
          medicalCertificate: pendingCert ? "" : cert,
        },
        uploads: pendingCert
          ? [{ uploadId: pendingCert, field: "medicalCertificate" }]
          : undefined,
      });
      await draft.clear();
      setAlert({
        open: true,
        message: result.queued
          ? "Saved on this device. Your request will be sent when you’re back online."
          : result.data?.message || "Leave requested.",
        severity: result.queued ? "info" : "success",
      });
      onApplied();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const today = dayjs().format("YYYY-MM-DD");
  const buttons = (
    <>
      <DraftNote
        status={draft.status}
        savedAt={draft.savedAt}
        onDiscard={async () => {
          await draft.clear();
          setValues(EMPTY);
        }}
      />
      <Button onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" form="leave-form" busy={saving}>
        Submit Request
      </Button>
    </>
  );
  const form = (
    <form id="leave-form" onSubmit={submit} noValidate>
      <FormGrid columns={2}>
        <Field label="Duration" className={fieldSpan2}>
          <SegmentedControl
            role="radiogroup"
            label="Duration"
            value={values.unit}
            onChange={(v) => setValues((x) => ({ ...x, unit: v }))}
            segments={[
              { value: "full_day", label: "Full Days" },
              { value: "half_day", label: "Half Day" },
              { value: "short_leave", label: "Short Leave" },
            ]}
          />
        </Field>
        <Field
          label={values.unit === "full_day" ? "From" : "Date"}
          error={errors.from}
        >
          <TextInput
            type="date"
            min={today}
            value={values.from}
            onChange={set("from")}
            data-autofocus
          />
        </Field>
        {values.unit === "full_day" ? (
          <Field label="To" error={errors.to}>
            <TextInput
              type="date"
              min={values.from || today}
              value={values.to}
              onChange={set("to")}
            />
          </Field>
        ) : values.unit === "half_day" ? (
          <Field label="Half" error={errors.session}>
            <Select value={values.session} onChange={set("session")}>
              <option value="">Choose…</option>
              <option value="first_half">First Half</option>
              <option value="second_half">Second Half</option>
            </Select>
          </Field>
        ) : (
          <Field label="Hours" error={errors.shortLeaveHours}>
            <TextInput
              type="number"
              min={0.5}
              max={7}
              step={0.5}
              inputMode="decimal"
              value={values.shortLeaveHours}
              onChange={set("shortLeaveHours")}
            />
          </Field>
        )}
        <Field label="Leave Type" className={fieldSpan2}>
          <Select value={values.leaveType} onChange={set("leaveType")}>
            {types.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Reason"
          error={errors.reason}
          hint={`${values.reason.length} characters`}
          className={fieldSpan2}
        >
          <TextArea value={values.reason} onChange={set("reason")} rows={3} />
        </Field>
        <label className={`${inlineCheckClass} ${fieldSpan2}`}>
          <Switch
            checked={values.sick_leave}
            onChange={(v) => setValues((x) => ({ ...x, sick_leave: v }))}
            label="This is sick leave"
          />
          This is sick leave
        </label>
      </FormGrid>
      <Collapse open={values.sick_leave}>
        <div style={{ paddingTop: 16 }}>
          <Field
            label="Medical Certificate"
            optional
            hint="PDF or image, up to 15 MB."
          >
            <FileField
              value={values.medicalCertificate}
              onChange={(v) =>
                setValues((x) => ({
                  ...x,
                  medicalCertificate: String(v || ""),
                }))
              }
              folder="leave_medical_certificates"
              label="Upload Certificate"
              offlineCapable
            />
          </Field>
        </div>
      </Collapse>
    </form>
  );
  if (inline) {
    return (
      <div style={{ display: "grid", gap: 24 }}>
        {form}
        <div className="px-row" style={{ justifyContent: "flex-end" }}>
          {buttons}
        </div>
      </div>
    );
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Apply for Leave"
      width={440}
      footer={buttons}
    >
      {form}
    </Sheet>
  );
}
