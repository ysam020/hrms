import {
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import dayjs from "dayjs";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CheckIcon from "@mui/icons-material/Check";
import CancelIcon from "@mui/icons-material/Cancel";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import AddIcon from "@mui/icons-material/Add";
import VisibilityIcon from "@mui/icons-material/Visibility";
import FilterList from "@mui/icons-material/FilterList";
import { API_ENDPOINTS } from "@web/shared/constants";
import StatusTimeline, {
  type TimelineStage,
} from "@web/shared/components/StatusTimeline";

const STATUS_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Draft", value: "draft" },
  { label: "Processing", value: "processing" },
  { label: "Approved", value: "approved" },
  { label: "Disbursed", value: "disbursed" },
  { label: "Cancelled", value: "cancelled" },
];

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  draft: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
  processing: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  approved: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  disbursed: { color: "#6366f1", bg: "rgba(99,102,241,0.15)" },
  cancelled: { color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
};

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <Chip
      label={status.charAt(0).toUpperCase() + status.slice(1)}
      size="small"
      sx={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        fontWeight: 600,
        fontSize: "0.7rem",
        height: 22,
        borderRadius: "4px",
        "& .MuiChip-label": { padding: "0 8px" },
      }}
    />
  );
}

function buildPayrollRunStages(run: any): TimelineStage[] {
  const reachedProcessing = ["processing", "approved", "disbursed"].includes(
    run.status,
  );
  const stages: TimelineStage[] = [
    { label: "Initiated", date: run.createdAt, state: "done" },
    // No dedicated timestamp column for this transition — only the reached
    // state is knowable, not when it happened.
    { label: "Processing", state: reachedProcessing ? "done" : "pending" },
    {
      label: "Approved",
      date: run.approvedAt || undefined,
      state: run.approvedAt ? "done" : "pending",
    },
    {
      label: "Disbursed",
      date: run.disbursedAt || undefined,
      state: run.disbursedAt ? "done" : "pending",
    },
  ];

  if (run.status === "cancelled") {
    // Cut off at the first not-yet-reached stage and mark termination there
    // — no dedicated "cancelledAt" column exists to date this precisely.
    const cutoff = stages.findIndex((s) => s.state === "pending");
    return [
      ...stages.slice(0, cutoff === -1 ? stages.length : cutoff),
      { label: "Cancelled", state: "rejected" },
    ];
  }

  return stages;
}

function PayrollRuns() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const [openInitiate, setOpenInitiate] = useState(false);
  const [viewRun, setViewRun] = useState<any>(null);

  // Date guards — payroll can only be initiated for past months.
  // Declared before the form useState so _prevDate can use them.
  const _now = new Date();
  const currentYear = _now.getFullYear();
  const currentMonth = _now.getMonth() + 1; // 1-indexed

  // Default to the previous calendar month so the form is never pointed at the current/future month.
  const _prevDate = new Date(_now.getFullYear(), _now.getMonth() - 1, 1);
  const [form, setForm] = useState({
    month: _prevDate.getMonth() + 1,
    year: _prevDate.getFullYear(),
  });
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef("");
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHr = isHrOrAbove(user);

  const fetchRuns = useCallback(
    async ({ page, limit }) => {
      try {
        const params =
          statusFilter && statusFilter !== "All"
            ? `&status=${statusFilter}`
            : "";
        const res = await apiClient(
          API_ENDPOINTS.PAYROLL_RUNS(page, limit, params),
        );
        return {
          data: res.data.data?.runs || res.data.data || [],
          totalCount: res.data.data?.total || 0,
        };
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message: "Failed to fetch payroll runs",
          severity: "error",
        });
        throw err;
      }
    },
    [statusFilter, setAlert],
  );

  const {
    data,
    loading,
    totalCount,
    pagination,
    handlePaginationChange,
    handlePageSizeChange,
    refresh,
    resetPagination,
  } = useServerPagination(fetchRuns, {
    initialPageSize: 10,
    deps: [statusFilter],
  });

  const handleGlobalFilterChange = useCallback(
    (value: string) => {
      searchRef.current = value ?? "";
      setGlobalFilter(value ?? "");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => resetPagination(), 400);
    },
    [resetPagination],
  );

  const handleAction = useCallback(
    async (runId: string, status: string) => {
      try {
        await apiClient.patch(API_ENDPOINTS.UPDATE_PAYROLL_RUN_STATUS, {
          runId,
          status,
        });
        refresh();
        setAlert({
          open: true,
          message: `Payroll run ${status} successfully`,
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message: err?.response?.data?.message || "Action failed",
          severity: "error",
        });
      }
    },
    [refresh, setAlert],
  );

  const handleInitiate = useCallback(async () => {
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.INITIATE_PAYROLL_RUN, form);
      refresh();
      setOpenInitiate(false);
      setAlert({
        open: true,
        message: "Payroll run initiated",
        severity: "success",
      });
    } catch (err) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message || "Failed to initiate payroll run",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, refresh, setAlert]);

  const money = (v: number | null | undefined) =>
    v != null ? `₹${Number(v).toLocaleString("en-IN")}` : "—";

  const columns = useMemo(
    () => [
      {
        key: "month",
        label: "Period",
        primary: true,
        hideLabel: true,
        render: (row: any) =>
          dayjs(new Date(row.year, (row.month ?? 1) - 1)).format("MMMM YYYY"),
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => <StatusChip status={row.status} />,
      },
      {
        key: "employeeCount",
        label: "Employees",
        render: (row: any) => row.employeeCount ?? "—",
      },
      {
        key: "totalGross",
        label: "Total Gross",
        render: (row: any) => money(row.totalGross),
      },
      {
        key: "totalNet",
        label: "Total Net",
        render: (row: any) => (
          <Box component="span" sx={{ color: "success.main", fontWeight: 500 }}>
            {money(row.totalNet)}
          </Box>
        ),
      },
      {
        key: "createdAt",
        label: "Initiated On",
        render: (row: any) =>
          row.createdAt ? dayjs(row.createdAt).format("DD MMM YYYY") : "—",
      },
    ],
    [],
  );

  const rowActions = useCallback(
    (row: any) => {
      const actions: any[] = [
        {
          icon: <VisibilityIcon sx={{ fontSize: 16 }} />,
          label: "View",
          color: "primary" as const,
          onClick: () => setViewRun(row),
        },
      ];
      if (!isHr) return actions;
      if (row.status === "draft") {
        actions.push({
          icon: <PlayArrowIcon sx={{ fontSize: 16 }} />,
          label: "Submit for Approval",
          color: "primary" as const,
          onClick: () => handleAction(row.id, "processing"),
        });
      }
      if (row.status === "processing") {
        actions.push({
          icon: <CheckIcon sx={{ fontSize: 16 }} />,
          label: "Approve",
          color: "success" as const,
          onClick: () => handleAction(row.id, "approved"),
        });
      }
      if (row.status === "approved") {
        actions.push({
          icon: <CheckIcon sx={{ fontSize: 16 }} />,
          label: "Mark Disbursed",
          color: "primary" as const,
          onClick: () => handleAction(row.id, "disbursed"),
        });
      }
      if (["draft", "processing"].includes(row.status)) {
        actions.push({
          icon: <CancelIcon sx={{ fontSize: 16 }} />,
          label: "Cancel",
          color: "error" as const,
          onClick: () => handleAction(row.id, "cancelled"),
        });
      }
      return actions;
    },
    [isHr, handleAction],
  );

  const memoizedData = useMemo(() => data || [], [data]);

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="Payroll runs"
        data={memoizedData}
        columns={columns}
        actions={rowActions}
        loading={loading}
        emptyMessage="No payroll runs found"
        search={{
          value: globalFilter,
          onChange: handleGlobalFilterChange,
          placeholder: "Search…",
        }}
        toolbarActions={
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FilterList
                sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
              />
              <Box sx={{ minWidth: 130 }}>
                <Dropdown
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.value)}
                  options={STATUS_OPTIONS}
                  placeholder="Select Status"
                  className="w-full"
                  style={{ minWidth: "130px" }}
                  appendTo={() =>
                    document.querySelector("#root .App") as HTMLElement
                  }
                />
              </Box>
            </Box>
            {isHr && (
              <Tooltip title="Initiate Payroll Run">
                <span>
                  <IconButton
                    color="primary"
                    size="small"
                    onClick={() => setOpenInitiate(true)}
                    aria-label="Initiate payroll run"
                  >
                    <AddIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Box>
        }
        pagination={{
          page: pagination.pageIndex,
          pageSize: pagination.pageSize,
          totalCount,
          onPageChange: (page) =>
            handlePaginationChange({ ...pagination, pageIndex: page }),
          onPageSizeChange: handlePageSizeChange,
          pageSizeOptions: [5, 10, 25, 50],
        }}
      />

      <Dialog
        open={openInitiate}
        onClose={() => setOpenInitiate(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Initiate Payroll Run</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 0.5 }}
            >
              Payroll Month
            </Typography>
            <Calendar
              value={new Date(form.year, form.month - 1, 1)}
              onChange={(e) => {
                const d = e.value as Date;
                if (d)
                  setForm({ month: d.getMonth() + 1, year: d.getFullYear() });
              }}
              view="month"
              dateFormat="mm/yy"
              maxDate={new Date(currentYear, currentMonth - 1, 0)}
              showIcon
              appendTo={document.body}
              placeholder="Select month"
              style={{ width: "100%" }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            variant="ghost"
            onClick={() => setOpenInitiate(false)}
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleInitiate}
            variant="primary"
            size="small"
            disabled={submitting}
          >
            {submitting ? "Initiating…" : "Initiate"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!viewRun}
        onClose={() => setViewRun(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {viewRun &&
            dayjs(new Date(viewRun.year, (viewRun.month ?? 1) - 1)).format(
              "MMMM YYYY",
            )}{" "}
          Payroll Run
        </DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "16px !important",
          }}
        >
          {viewRun && (
            <>
              <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                <StatusChip status={viewRun.status} />
                <Typography variant="body2" color="text.secondary">
                  {viewRun.employeeCount ?? "—"} employees · Gross{" "}
                  {money(viewRun.totalGross)} · Net {money(viewRun.totalNet)}
                </Typography>
              </Box>
              <StatusTimeline stages={buildPayrollRunStages(viewRun)} />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="ghost" onClick={() => setViewRun(null)} size="small">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorBoundary>
  );
}

export default memo(PayrollRuns);
