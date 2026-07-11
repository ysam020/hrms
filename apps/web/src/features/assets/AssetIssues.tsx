import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dayjs from "dayjs";
import { Dropdown } from "primereact/dropdown";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import RateReviewIcon from "@mui/icons-material/RateReview";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import FilterList from "@mui/icons-material/FilterList";
import { API_ENDPOINTS } from "@web/shared/constants";

// ── Config ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Open", value: "open" },
  { label: "In Review", value: "in_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Resolved", value: "resolved" },
];

const ISSUE_TYPES = [
  { value: "malfunction", label: "Malfunction" },
  { value: "damage", label: "Damage" },
  { value: "lost", label: "Lost" },
  { value: "stolen", label: "Stolen" },
  { value: "return_request", label: "Return Request" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  open: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  in_review: { color: "#6366f1", bg: "rgba(99,102,241,0.15)" },
  approved: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  rejected: { color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
  resolved: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
};

const PRIORITY_CFG: Record<string, { color: string }> = {
  low: { color: "#64748b" },
  medium: { color: "#d97706" },
  high: { color: "#ea580c" },
  critical: { color: "#dc2626" },
};

// Allowed HR actions per current status.
const NEXT_ACTIONS: Record<
  string,
  { status: string; label: string; icon: React.ReactNode }[]
> = {
  open: [
    {
      status: "in_review",
      label: "Start Review",
      icon: <RateReviewIcon sx={{ fontSize: 16 }} />,
    },
  ],
  in_review: [
    {
      status: "approved",
      label: "Approve",
      icon: <CheckCircleIcon sx={{ fontSize: 16 }} />,
    },
    {
      status: "rejected",
      label: "Reject",
      icon: <CancelIcon sx={{ fontSize: 16 }} />,
    },
  ],
  approved: [
    {
      status: "resolved",
      label: "Resolve",
      icon: <TaskAltIcon sx={{ fontSize: 16 }} />,
    },
  ],
};

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.open;
  const label = status.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());
  return (
    <Chip
      label={label}
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

function PriorityLabel({ priority }: { priority: string }) {
  const cfg = PRIORITY_CFG[priority] ?? PRIORITY_CFG.medium;
  return (
    <Typography
      variant="body2"
      fontSize="0.8rem"
      fontWeight={600}
      sx={{ color: cfg.color }}
    >
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </Typography>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

function AssetIssues() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);

  const isHr =
    user?.role?.some((r: string) => ["owner", "admin", "hr"].includes(r)) ||
    user?.isSuperUser;

  // ── Table state ────────────────────────────────────────────────────────────
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Report dialog (employee) ───────────────────────────────────────────────
  const [openReport, setOpenReport] = useState(false);
  const [myAssets, setMyAssets] = useState<
    { id: string; assetCode: string; name: string }[]
  >([]);
  const [reportForm, setReportForm] = useState({
    assetId: "",
    type: "malfunction",
    priority: "medium",
    title: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Load assets when the report dialog opens.
  // HR: all assigned assets across tenant. Employee: only their own.
  useEffect(() => {
    if (!openReport) return;
    const url = isHr
      ? "/assets?status=assigned&limit=200"
      : "/assets?limit=100";
    apiClient
      .get(url)
      .then((res) => {
        const list: any[] = Array.isArray(res.data?.data) ? res.data.data : [];
        setMyAssets(
          list.map((a: any) => ({
            id: a.id,
            assetCode: a.assetCode,
            name: a.name,
          })),
        );
      })
      .catch(() => setMyAssets([]));
  }, [openReport, isHr]);

  // ── Action dialog (HR) ─────────────────────────────────────────────────────
  const [actionDialog, setActionDialog] = useState<{
    issueId: string;
    targetStatus: string;
    label: string;
    currentType: string;
  } | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [actioning, setActioning] = useState(false);

  // ── Fetch issues ───────────────────────────────────────────────────────────
  const fetchIssues = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        let params = search ? `&search=${encodeURIComponent(search)}` : "";
        if (statusFilter && statusFilter !== "All") {
          params += `&status=${statusFilter}`;
        }
        const res = await apiClient(
          API_ENDPOINTS.ASSET_ISSUES(page, limit, params),
        );
        return {
          data: res.data.data ?? [],
          totalCount: res.data.total ?? 0,
        };
      } catch (err: any) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message: "Failed to fetch issues",
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
  } = useServerPagination(fetchIssues, {
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

  // ── Submit report ──────────────────────────────────────────────────────────
  const handleReport = useCallback(async () => {
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.REPORT_ASSET_ISSUE, reportForm);
      refresh();
      setOpenReport(false);
      setReportForm({
        assetId: "",
        type: "malfunction",
        priority: "medium",
        title: "",
        description: "",
      });
      setAlert({ open: true, message: "Issue reported", severity: "success" });
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Failed to report issue",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [reportForm, refresh, setAlert]);

  // ── Submit HR action ───────────────────────────────────────────────────────
  const handleAction = useCallback(async () => {
    if (!actionDialog) return;
    setActioning(true);
    try {
      await apiClient.patch(
        API_ENDPOINTS.UPDATE_ASSET_ISSUE_STATUS(actionDialog.issueId),
        { status: actionDialog.targetStatus, notes: actionNotes || undefined },
      );
      refresh();
      setActionDialog(null);
      setActionNotes("");
      setAlert({
        open: true,
        message: `Issue marked as '${actionDialog.targetStatus}'`,
        severity: "success",
      });
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Action failed",
        severity: "error",
      });
    } finally {
      setActioning(false);
    }
  }, [actionDialog, actionNotes, refresh, setAlert]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: "asset",
        label: "Asset",
        primary: true,
        hideLabel: true,
        render: (row: any) => (
          <Box>
            <Typography
              variant="body2"
              fontSize="0.8rem"
              fontWeight={600}
              sx={{ fontFamily: "monospace" }}
            >
              {row.asset?.assetCode ?? "—"}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {row.asset?.name ?? ""}
            </Typography>
          </Box>
        ),
      },
      {
        key: "type",
        label: "Type",
        render: (row: any) =>
          ISSUE_TYPES.find((t) => t.value === row.type)?.label ?? row.type,
      },
      {
        key: "priority",
        label: "Priority",
        render: (row: any) => <PriorityLabel priority={row.priority} />,
      },
      {
        key: "title",
        label: "Title",
        render: (row: any) => row.title,
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => <StatusChip status={row.status} />,
      },
      ...(isHr
        ? [
            {
              key: "reporter",
              label: "Reported By",
              render: (row: any) => row.reporter?.username ?? "—",
            },
          ]
        : []),
      {
        key: "createdAt",
        label: "Reported On",
        render: (row: any) =>
          row.createdAt ? dayjs(row.createdAt).format("DD MMM YYYY") : "—",
      },
    ],
    [isHr],
  );

  const rowActions = useCallback(
    (row: any) => {
      if (!isHr) return [];
      const next = NEXT_ACTIONS[row.status] ?? [];
      return next.map((a) => ({
        icon: a.icon,
        label: a.label,
        onClick: () =>
          setActionDialog({
            issueId: row.id,
            targetStatus: a.status,
            label: a.label,
            currentType: row.type,
          }),
      }));
    },
    [isHr],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="Asset issues"
        data={data || []}
        columns={columns}
        actions={rowActions}
        loading={loading}
        emptyMessage="No asset issues found"
        search={{
          value: globalFilter,
          onChange: handleGlobalFilterChange,
          placeholder: "Search issues…",
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
            <Tooltip title="Report Issue">
              <span>
                <IconButton
                  color="primary"
                  size="small"
                  onClick={() => setOpenReport(true)}
                  aria-label="Report asset issue"
                >
                  <AddIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </span>
            </Tooltip>
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

      {/* ── Report Issue Dialog (Employee) ───────────────────────────────── */}
      <Dialog
        open={openReport}
        onClose={() => {
          setOpenReport(false);
          setReportForm({
            assetId: "",
            type: "malfunction",
            priority: "medium",
            title: "",
            description: "",
          });
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Report Asset Issue</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "16px !important",
          }}
        >
          <TextField
            select
            label="Asset"
            size="small"
            fullWidth
            value={reportForm.assetId}
            onChange={(e) =>
              setReportForm((f) => ({ ...f, assetId: e.target.value }))
            }
            helperText="Only your currently assigned assets are shown"
          >
            {myAssets.length === 0 ? (
              <MenuItem disabled value="">
                No assets assigned to you
              </MenuItem>
            ) : (
              myAssets.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.assetCode} — {a.name}
                </MenuItem>
              ))
            )}
          </TextField>

          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              select
              label="Issue Type"
              size="small"
              fullWidth
              value={reportForm.type}
              onChange={(e) =>
                setReportForm((f) => ({ ...f, type: e.target.value }))
              }
            >
              {ISSUE_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Priority"
              size="small"
              fullWidth
              value={reportForm.priority}
              onChange={(e) =>
                setReportForm((f) => ({ ...f, priority: e.target.value }))
              }
            >
              {PRIORITIES.map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <TextField
            label="Title"
            size="small"
            fullWidth
            placeholder="Brief summary of the issue"
            value={reportForm.title}
            onChange={(e) =>
              setReportForm((f) => ({ ...f, title: e.target.value }))
            }
          />

          <TextField
            label="Description"
            size="small"
            multiline
            rows={3}
            fullWidth
            placeholder="Describe the issue in detail…"
            value={reportForm.description}
            onChange={(e) =>
              setReportForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button
            variant="ghost"
            onClick={() => {
              setOpenReport(false);
              setReportForm({
                assetId: "",
                type: "malfunction",
                priority: "medium",
                title: "",
                description: "",
              });
            }}
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleReport}
            variant="primary"
            size="small"
            disabled={
              submitting ||
              !reportForm.assetId ||
              !reportForm.title ||
              !reportForm.description
            }
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── HR Action Dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={!!actionDialog}
        onClose={() => {
          setActionDialog(null);
          setActionNotes("");
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{actionDialog?.label} Issue</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "16px !important",
          }}
        >
          {actionDialog?.targetStatus === "resolved" && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {actionDialog.currentType === "lost" ||
              actionDialog.currentType === "stolen"
                ? "⚠️ This will retire the asset."
                : actionDialog.currentType === "damage"
                  ? "⚠️ This will move the asset to maintenance."
                  : actionDialog.currentType === "return_request"
                    ? "⚠️ This will close the assignment and mark the asset as available."
                    : null}
            </Typography>
          )}
          <TextField
            label="Notes (optional)"
            size="small"
            multiline
            rows={3}
            fullWidth
            placeholder="Add any notes for this action…"
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button
            variant="ghost"
            onClick={() => {
              setActionDialog(null);
              setActionNotes("");
            }}
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAction}
            variant={
              actionDialog?.targetStatus === "rejected" ? "danger" : "primary"
            }
            size="small"
            disabled={actioning}
          >
            {actioning ? "Saving…" : actionDialog?.label}
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorBoundary>
  );
}

export default memo(AssetIssues);
