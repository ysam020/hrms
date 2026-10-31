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
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateTile,
  Field,
  FileField,
  FormGrid,
  FormSection,
  Icon,
  Page,
  Pagination,
  PeriodStepper,
  PrimaryCell,
  SearchField,
  SegmentedControl,
  Section,
  Select,
  Sheet,
  StatTile,
  StatTiles,
  Status,
  SummaryRow,
  Switch,
  TextArea,
  TextInput,
  TextSkeleton,
  UserCombobox,
  focusFirstInvalid,
  inlineCheckClass,
  toneForStatus,
  type Column,
  type IconName,
  type Person,
  type Tone,
} from "@next/ui";
import a from "./attendance.module.css";
import { PENDING_UPLOAD } from "@next/ui/FileField";
import { DraftNote, sendOrQueue, useOfflineDraft } from "@next/offline";
import { apiClient, errorMessage, isCanceled } from "@next/lib/api";
import { useGet, useIsCompact } from "@next/lib/hooks";
import { fmtDate, fmtTime, personName } from "@next/lib/format";
import { DASHBOARD_ENDPOINTS } from "@next/features/dashboard/data";

// Attendance & Leave pages (one per sidebar entry, Classic's paths):
//   /attendance                          My Attendance
//   /attendance/view-all-attendances     All Attendance
//   /attendance/attendance-correction    Corrections
//   /attendance/view-leave-applications  Leave Applications
//   /attendance/apply-leave              Apply for Leave

export function MyAttendancePage() {
  return (
    <Page
      title="My Attendance"
      description="Your punches, hours and time away for the month."
    >
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
    <Page
      title="Attendance Corrections"
      width="wide"
      description="Fix a missed or wrong punch. Corrections count toward the employee’s monthly allowance, shown once you choose them."
    >
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
          data-tour="leave-apply"
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
      width="wide"
      description="Request time off. It goes to your approver for a decision once you submit."
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

/** "half_day" / "half Day" / "Half Day" → "Half Day". */
const attendanceLabel = (status?: string | null) =>
  status
    ? status
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

const STRIP_LEGEND: { tone: Tone; label: string }[] = [
  { tone: "success", label: "Present" },
  { tone: "warning", label: "Late or half day" },
  { tone: "accent", label: "Leave or holiday" },
  { tone: "danger", label: "Absent" },
  { tone: "neutral", label: "No record" },
];

/**
 * The month at a glance: one cell per day, filled by its status tone. The
 * table below carries the same data as text, so the strip is decorative for
 * assistive tech beyond its one-line summary.
 */
function MonthStrip({
  month,
  byDay,
}: {
  month: dayjs.Dayjs;
  byDay: Map<number, string>;
}) {
  const today = dayjs();
  const days = month.daysInMonth();
  const lead = month.startOf("month").day(); // 0 = Sunday
  const counts = new Map<string, number>();
  for (const st of byDay.values()) counts.set(st, (counts.get(st) ?? 0) + 1);
  const summary = [...counts.entries()]
    .map(([st, n]) => `${n} ${st}`)
    .join(", ");
  return (
    <div className={a.stripWrap}>
      <div
        className={a.strip}
        role="img"
        aria-label={`${month.format("MMMM")}: ${summary || "no records yet"}`}
      >
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={`h${i}`} className={a.stripHead} aria-hidden>
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} aria-hidden />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const date = month.date(day);
          const status = byDay.get(day);
          const future = date.isAfter(today, "day");
          return (
            <span
              key={day}
              className={a.stripDay}
              data-tone={status ? toneForStatus(status) : undefined}
              data-future={future || undefined}
              data-today={date.isSame(today, "day") || undefined}
              title={`${date.format("ddd D MMM")}${status ? ` · ${status}` : ""}`}
              aria-hidden
            >
              {day}
            </span>
          );
        })}
      </div>
      <ul className={a.legend} aria-hidden>
        {STRIP_LEGEND.map((l) => (
          <li key={l.label}>
            <i data-tone={l.tone} />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  const statusOf = (r: any) =>
    r.status ? attendanceLabel(r.status) : tIn(r) ? "Present" : "";
  const byDay = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      const st = statusOf(r);
      if (st) map.set(dayjs(r.date).date(), st);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const isThisMonth = month.isSame(dayjs(), "month");
  const maxCorr = Number(sm.maxCorrectionsPerMonth) || 0;
  const leftCorr = sm.remainingCorrections;

  const columns: Column<any>[] = [
    {
      key: "date",
      header: "Date",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          leading={
            <DateTile
              date={r.date}
              size="small"
              tone={toneForStatus(statusOf(r))}
              muted={!statusOf(r)}
            />
          }
          title={dayjs(r.date).format("dddd")}
        />
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
      stackLabel: "Hours",
      render: (r) => {
        if (!tIn(r) || !tOut(r)) return <span className="px-tertiary">—</span>;
        const mins = dayjs(tOut(r)).diff(dayjs(tIn(r)), "minute");
        return (
          <span className="px-num">
            {`${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => <Status value={statusOf(r) || null} />,
    },
  ];

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <PeriodStepper
        label={month.format("MMMM YYYY")}
        previousLabel="Previous month"
        nextLabel="Next month"
        onPrevious={() => setMonth((d) => d.subtract(1, "month"))}
        onNext={() => setMonth((d) => d.add(1, "month"))}
        nextDisabled={isThisMonth}
        onReset={
          isThisMonth ? undefined : () => setMonth(dayjs().startOf("month"))
        }
        resetLabel="This Month"
      />
      <div data-tour="attendance-summary">
        <StatTiles label="Month summary">
          <StatTile
            label="Present"
            icon="checkCircle"
            tone="success"
            value={sm.presents ?? "—"}
            loading={summary.loading}
          />
          <StatTile
            label="Half Days"
            icon="halfDay"
            tone="warning"
            value={sm.halfDays ?? "—"}
            loading={summary.loading}
          />
          <StatTile
            label="Paid Leave"
            icon="leave"
            tone="accent"
            value={sm.paidLeaves ?? "—"}
            loading={summary.loading}
          />
          <StatTile
            label="Unpaid Leave"
            icon="calendar"
            tone={Number(sm.unpaidLeaves) > 0 ? "danger" : "neutral"}
            value={sm.unpaidLeaves ?? "—"}
            note="Loss of pay"
            loading={summary.loading}
          />
          <StatTile
            label="Corrections Left"
            icon="edit"
            tone={
              leftCorr == null
                ? "neutral"
                : Number(leftCorr) === 0
                  ? "danger"
                  : "neutral"
            }
            value={leftCorr ?? "—"}
            note={maxCorr ? `of ${maxCorr} this month` : undefined}
            progress={
              maxCorr && leftCorr != null
                ? Number(leftCorr) / maxCorr
                : undefined
            }
            loading={summary.loading}
          />
        </StatTiles>
      </div>
      {rows.length > 0 && (
        <Section
          title="At a Glance"
          detail={month.format("MMMM YYYY")}
          headingLevel={2}
        >
          <Card style={{ justifySelf: "start", maxWidth: "100%" }}>
            <MonthStrip month={month} byDay={byDay} />
          </Card>
        </Section>
      )}
      <Section title="Daily Record" detail={`${rows.length} days recorded`}>
        <DataTable
          label={`Attendance for ${month.format("MMMM YYYY")}`}
          tour="attendance-daily"
          columns={columns}
          rows={rows}
          rowId={(r) => String(r._id || r.id || r.date)}
          loading={records.loading}
          error={records.error}
          onRetry={records.refetch}
          stickyOffset={52}
          empty={{
            icon: "clock",
            title: isThisMonth
              ? "No attendance recorded yet"
              : `No attendance for ${month.format("MMMM")}`,
            body: isThisMonth
              ? "Punch in from Today to start this month’s record."
              : "Nothing was recorded for you this month.",
          }}
        />
      </Section>
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
          tour="leave-status"
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
            data-tour="leave-search"
          />
        </div>
      </div>
      <DataTable
        label="Leave applications"
        tour="leave-table"
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
      <div
        className="px-row"
        style={{ gap: 8 }}
        data-tour="attendance-team-filters"
      >
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
        tour="attendance-team-table"
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
  const [person, setPerson] = useState<Person | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // The allowance for the chosen employee in the month being corrected.
  // The gateway only lets a caller read their own summary unless they're
  // privileged; a refusal just hides the indicator.
  const forMonth = values.timeIn ? dayjs(values.timeIn) : dayjs();
  const allowance = useGet<any>(
    values.userId
      ? API_ENDPOINTS.GET_ATTENDANCE_SUMMARY(
          values.userId,
          forMonth.year(),
          forMonth.month() + 1,
        )
      : null,
  );
  const left = allowance.data?.remainingCorrections;
  const max = Number(allowance.data?.maxCorrectionsPerMonth) || 0;
  const noneLeft = left != null && Number(left) <= 0;

  const set = (k: keyof typeof values, v: string) => {
    setValues((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
    setDone(null);
  };

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
    if (Object.keys(next).length) return focusFirstInvalid();
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
      setDone(
        `${person?.name ?? "The employee"}’s attendance for ${fmtDate(values.timeIn)} was corrected.`,
      );
      setValues({ userId: "", timeIn: "", timeOut: "" });
      setPerson(null);
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const mins =
    values.timeIn && values.timeOut
      ? dayjs(values.timeOut).diff(dayjs(values.timeIn), "minute")
      : null;

  return (
    <div className={a.correctionGrid}>
      <form
        onSubmit={submit}
        noValidate
        style={{ display: "grid", gap: 16 }}
        data-tour="corrections-form"
      >
        {done && (
          <Banner tone="success" title="Correction saved">
            {done}
          </Banner>
        )}
        <FormSection
          icon="person"
          title="Employee"
          description="Whose attendance needs fixing."
        >
          <Field label="Employee" error={errors.userId}>
            <UserCombobox
              value={values.userId}
              onChange={(userId, p) => {
                set("userId", userId);
                setPerson(p);
              }}
            />
          </Field>
          {values.userId && left != null && !allowance.loading && (
            <Banner
              tone={noneLeft ? "danger" : "accent"}
              icon={noneLeft ? "alert" : "info"}
            >
              {noneLeft
                ? `${person?.name ?? "This employee"} has used all ${max || ""} corrections for ${forMonth.format("MMMM")}. Another one will go over the allowance.`
                : `${left} of ${max || "—"} corrections left for ${forMonth.format("MMMM")}.`}
            </Banner>
          )}
        </FormSection>
        <FormSection
          icon="clock"
          title="Corrected Times"
          description="Enter the times the employee actually started and finished."
        >
          <div className={a.timeRow}>
            <div className={a.timeCard}>
              <span className={a.timeCardTitle}>
                <Icon name="arrowRight" />
                Punch In
              </span>
              <Field label="Date and Time" error={errors.timeIn}>
                <TextInput
                  type="datetime-local"
                  value={values.timeIn}
                  onChange={(e) => set("timeIn", e.target.value)}
                />
              </Field>
            </div>
            <div className={a.timeCard}>
              <span className={a.timeCardTitle}>
                <Icon name="logout" />
                Punch Out
              </span>
              <Field
                label="Date and Time"
                optional
                hint="Leave blank to fix only the punch in."
                error={errors.timeOut}
              >
                <TextInput
                  type="datetime-local"
                  value={values.timeOut}
                  min={values.timeIn || undefined}
                  onChange={(e) => set("timeOut", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </FormSection>
        <div className="px-row" style={{ justifyContent: "flex-end" }}>
          <Button type="submit" variant="primary" icon="check" busy={saving}>
            Save Correction
          </Button>
        </div>
      </form>
      <aside style={{ display: "grid", gap: 16 }}>
        <Card>
          <div style={{ display: "grid", gap: 12 }}>
            <h2 className="px-headline">Before you correct</h2>
            <ul className={a.rules}>
              <li>
                <Icon name="info" />
                Each correction counts toward the employee’s monthly allowance
                {max ? ` of ${max}` : ""}.
              </li>
              <li>
                <Icon name="info" />
                You can correct your own attendance. Correcting someone else’s
                needs super user access.
              </li>
              <li>
                <Icon name="info" />
                The times you enter replace the recorded ones for that day. A
                blank punch out keeps the existing one.
              </li>
            </ul>
          </div>
        </Card>
        <Card>
          <div style={{ display: "grid", gap: 4 }}>
            <h2 className="px-headline" style={{ marginBottom: 6 }}>
              Summary
            </h2>
            <SummaryRow
              label="Employee"
              value={person?.name ?? (values.userId ? "Selected" : "—")}
            />
            <SummaryRow
              label="Date"
              value={values.timeIn ? fmtDate(values.timeIn) : "—"}
            />
            <SummaryRow
              label="In"
              value={values.timeIn ? fmtTime(values.timeIn) : "—"}
            />
            <SummaryRow
              label="Out"
              value={values.timeOut ? fmtTime(values.timeOut) : "Unchanged"}
            />
            <SummaryRow
              label="Hours"
              emphasis
              value={
                mins != null && mins >= 0
                  ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`
                  : "—"
              }
            />
          </div>
        </Card>
      </aside>
    </div>
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
  // The same balances the Today dashboard shows (GET /dashboard/data); the
  // page form shows them beside the request so the choice is informed.
  const balances = useGet<any>(
    open && inline ? DASHBOARD_ENDPOINTS.DATA(["leave-balance"]) : null,
  );
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
  const typeLabel = types.find(([k]) => k === values.leaveType)?.[1];
  const reasonLength = values.reason.trim().length;
  const spanDays =
    values.unit === "full_day" && values.from && values.to
      ? dayjs(values.to).diff(dayjs(values.from), "day") + 1
      : null;
  const durationText =
    values.unit === "full_day"
      ? spanDays && spanDays > 0
        ? `${spanDays} calendar day${spanDays === 1 ? "" : "s"}`
        : "—"
      : values.unit === "half_day"
        ? values.session
          ? `Half day · ${values.session === "first_half" ? "first half" : "second half"}`
          : "Half day"
        : values.shortLeaveHours
          ? `${values.shortLeaveHours} hour${Number(values.shortLeaveHours) === 1 ? "" : "s"}`
          : "Short leave";
  const datesText = values.from
    ? values.unit === "full_day" && values.to && values.to !== values.from
      ? `${fmtDate(values.from)} – ${fmtDate(values.to)}`
      : fmtDate(values.from)
    : "—";

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

  const whenFields = (
    <FormGrid columns={2}>
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
        <Field
          label="To"
          error={errors.to}
          hint={
            spanDays && spanDays > 0 && !errors.to
              ? `${spanDays} calendar day${spanDays === 1 ? "" : "s"}`
              : undefined
          }
        >
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
        <Field
          label="Hours"
          error={errors.shortLeaveHours}
          hint="Half an hour to 7 hours"
        >
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
    </FormGrid>
  );

  const typeField = (
    <Field label="Leave Type">
      <Select value={values.leaveType} onChange={set("leaveType")}>
        {types.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </Field>
  );

  const reasonField = (
    <Field
      label="Reason"
      error={errors.reason}
      hint={`${reasonLength} character${reasonLength === 1 ? "" : "s"} · at least 5. Your approver sees this.`}
    >
      <TextArea value={values.reason} onChange={set("reason")} rows={3} />
    </Field>
  );

  const sick = (
    <>
      <label className={a.toggleRow}>
        <span className={a.toggleText}>
          <span>This is sick leave</span>
          <span>You can attach a medical certificate.</span>
        </span>
        <Switch
          checked={values.sick_leave}
          onChange={(v) => setValues((x) => ({ ...x, sick_leave: v }))}
          label="This is sick leave"
        />
      </label>
      <Collapse open={values.sick_leave}>
        <div style={{ paddingTop: 4 }}>
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
    </>
  );

  if (inline) {
    const balanceTypes: any[] =
      balances.data?.widgets?.["leave-balance"]?.ok === true
        ? (balances.data.widgets["leave-balance"].data?.types ?? [])
        : [];
    return (
      <div className={a.leaveGrid}>
        <form
          id="leave-form"
          onSubmit={submit}
          noValidate
          style={{ display: "grid", gap: 16 }}
          data-tour="leave-form"
        >
          <FormSection
            icon="calendar"
            title="When"
            description="Choose how long you’ll be away, then the dates."
          >
            <DurationPicker
              value={values.unit}
              onChange={(v) => setValues((x) => ({ ...x, unit: v }))}
            />
            {whenFields}
          </FormSection>
          <FormSection
            icon="leave"
            title="Details"
            description="The type of leave and a short note for your approver."
          >
            {typeField}
            {reasonField}
            {sick}
          </FormSection>
          <div className="px-row" style={{ justifyContent: "flex-end" }}>
            {buttons}
          </div>
        </form>
        <aside
          className={a.leaveAside}
          aria-label="Request summary"
          data-tour="leave-balance"
        >
          <Card>
            <div style={{ display: "grid", gap: 4 }}>
              <h2 className="px-headline" style={{ marginBottom: 6 }}>
                Your Request
              </h2>
              <SummaryRow label="Type" value={typeLabel ?? "—"} />
              <SummaryRow label="Dates" value={datesText} />
              <SummaryRow label="Duration" value={durationText} emphasis />
            </div>
          </Card>
          <Card>
            <div style={{ display: "grid", gap: 8 }}>
              <h2 className="px-headline">Available Balance</h2>
              {balances.loading ? (
                <TextSkeleton lines={3} />
              ) : balanceTypes.length ? (
                <dl className={a.balances}>
                  {balanceTypes.map((t) => (
                    <div
                      key={t.key}
                      className={a.balance}
                      data-selected={
                        String(t.key).toUpperCase() === values.leaveType ||
                        undefined
                      }
                    >
                      <dt>{t.name}</dt>
                      <dd>
                        {Number.isInteger(t.remaining)
                          ? t.remaining
                          : Number(t.remaining).toFixed(1)}
                        <small>days</small>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="px-meta">
                  Balances aren’t available right now. Your approver will check
                  them.
                </p>
              )}
            </div>
          </Card>
        </aside>
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
      <form
        id="leave-form"
        onSubmit={submit}
        noValidate
        style={{ display: "grid", gap: 16 }}
      >
        <Field label="Duration">
          <SegmentedControl
            role="radiogroup"
            label="Duration"
            value={values.unit}
            onChange={(v) => setValues((x) => ({ ...x, unit: v }))}
            segments={DURATIONS.map((d) => ({
              value: d.value,
              label: d.label,
            }))}
          />
        </Field>
        {whenFields}
        {typeField}
        {reasonField}
        {sick}
      </form>
    </Sheet>
  );
}

const DURATIONS: {
  value: string;
  label: string;
  note: string;
  icon: IconName;
}[] = [
  {
    value: "full_day",
    label: "Full Days",
    note: "One or more whole days",
    icon: "calendar",
  },
  {
    value: "half_day",
    label: "Half Day",
    note: "Morning or afternoon",
    icon: "halfDay",
  },
  {
    value: "short_leave",
    label: "Short Leave",
    note: "A few hours",
    icon: "clock",
  },
];

/** Three choice cards with radio semantics (arrow keys move the choice). */
function DurationPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + DURATIONS.length) % DURATIONS.length;
    refs.current[n]?.focus();
    onChange(DURATIONS[n].value);
  };
  return (
    <div className={a.durations} role="radiogroup" aria-label="Duration">
      {DURATIONS.map((d, i) => (
        <button
          key={d.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === d.value}
          tabIndex={value === d.value ? 0 : -1}
          className={a.duration}
          onClick={() => onChange(d.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          <span className={a.durationTitle}>
            <Icon name={d.icon} />
            {d.label}
          </span>
          <span className={a.durationNote}>{d.note}</span>
        </button>
      ))}
    </div>
  );
}
