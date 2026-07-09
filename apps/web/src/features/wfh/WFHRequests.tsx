import {
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import dayjs from "dayjs";
import { Calendar } from "primereact/calendar";
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
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import AddIcon from "@mui/icons-material/Add";
import FilterList from "@mui/icons-material/FilterList";
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  Pending: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  Approved: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  Rejected: { color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
  Cancelled: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
};

const STATUS_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Pending", value: "Pending" },
  { label: "Approved", value: "Approved" },
  { label: "Rejected", value: "Rejected" },
  { label: "Cancelled", value: "Cancelled" },
];

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.Pending;
  return (
    <Chip
      label={status}
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

function WFHRequests() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const [openRequest, setOpenRequest] = useState(false);
  const [form, setForm] = useState({
    date: dayjs().add(1, "day").format("YYYY-MM-DD"),
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isApprover =
    user?.role?.some((r: string) =>
      ["owner", "admin", "hr", "manager"].includes(r),
    ) || user?.isSuperUser;

  const fetchRequests = useCallback(
    async ({ page, limit }) => {
      try {
        let params = searchRef.current
          ? `&search=${encodeURIComponent(searchRef.current)}`
          : "";
        if (statusFilter && statusFilter !== "All") {
          params += `&status=${statusFilter}`;
        }
        const res = await apiClient(
          API_ENDPOINTS.WFH_REQUESTS(page, limit, params),
        );
        return {
          data: res.data.data?.requests || res.data.data || [],
          totalCount: res.data.data?.total || 0,
        };
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message: "Failed to fetch WFH requests",
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
  } = useServerPagination(fetchRequests, {
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
    async (requestId: string, action: "approve" | "reject" | "cancel") => {
      try {
        await apiClient.patch(API_ENDPOINTS.UPDATE_WFH_STATUS, {
          requestId,
          action,
        });
        refresh();
        setAlert({
          open: true,
          message: `WFH request ${action}d`,
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

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.REQUEST_WFH, form);
      refresh();
      setOpenRequest(false);
      setForm({ date: dayjs().add(1, "day").format("YYYY-MM-DD"), reason: "" });
      setAlert({
        open: true,
        message: "WFH request submitted",
        severity: "success",
      });
    } catch (err) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Request failed",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, refresh, setAlert]);

  const columns = useMemo(
    () => [
      {
        key: "employee",
        label: "Employee",
        primary: true,
        hideLabel: true,
        render: (row: any) =>
          row.employee
            ? `${row.employee.first_name} ${row.employee.last_name}`
            : "—",
      },
      {
        key: "date",
        label: "Date",
        render: (row: any) => dayjs(row.date).format("DD MMM YYYY"),
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => <StatusChip status={row.status} />,
      },
      {
        key: "reason",
        label: "Reason",
        render: (row: any) => row.reason ?? "—",
      },
    ],
    [],
  );

  const rowActions = useCallback(
    (row: any) => {
      if (row.status !== "Pending") return [];
      const isOwn = row.userId === user?.id;
      const actions: any[] = [];
      if (isApprover && !isOwn) {
        actions.push(
          {
            icon: <CheckIcon sx={{ fontSize: 16 }} />,
            label: "Approve",
            color: "success" as const,
            onClick: () => handleAction(row.id, "approve"),
          },
          {
            icon: <CloseIcon sx={{ fontSize: 16 }} />,
            label: "Reject",
            color: "error" as const,
            onClick: () => handleAction(row.id, "reject"),
          },
        );
      }
      if (isOwn) {
        actions.push({
          icon: <RemoveCircleIcon sx={{ fontSize: 16 }} />,
          label: "Cancel",
          onClick: () => handleAction(row.id, "cancel"),
        });
      }
      return actions;
    },
    [isApprover, user?.id, handleAction],
  );

  const memoizedData = useMemo(() => data || [], [data]);

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="WFH requests"
        data={memoizedData}
        columns={columns}
        actions={rowActions}
        loading={loading}
        emptyMessage="No WFH requests found"
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
            <Tooltip title="Request WFH">
              <span>
                <IconButton
                  color="primary"
                  size="small"
                  onClick={() => setOpenRequest(true)}
                  aria-label="Request WFH"
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

      <Dialog
        open={openRequest}
        onClose={() => setOpenRequest(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Request WFH</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "16px !important",
          }}
        >
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 0.5 }}
            >
              Date
            </Typography>
            <Calendar
              value={form.date ? new Date(form.date + "T00:00:00") : null}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  date: e.value
                    ? dayjs(e.value as Date).format("YYYY-MM-DD")
                    : "",
                }))
              }
              dateFormat="dd/mm/yy"
              minDate={new Date()}
              showIcon
              showButtonBar
              appendTo={document.body}
              placeholder="Select date"
              style={{ width: "100%" }}
            />
          </Box>
          <TextField
            label="Reason (optional)"
            size="small"
            multiline
            rows={3}
            fullWidth
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRequest(false)} size="small">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            size="small"
            disabled={submitting || !form.date}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorBoundary>
  );
}

export default memo(WFHRequests);
