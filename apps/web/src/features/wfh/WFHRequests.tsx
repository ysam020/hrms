import {
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import dayjs from "dayjs";
import { Calendar } from "primereact/calendar";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
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
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  Pending: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  Approved: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  Rejected: { color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
  Cancelled: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
};

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
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const [openRequest, setOpenRequest] = useState(false);
  const [form, setForm] = useState({
    date: dayjs().add(1, "day").format("YYYY-MM-DD"),
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [globalFilter, setGlobalFilter] = useState("");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isApprover =
    user?.role?.some((r: string) =>
      ["owner", "admin", "hr", "manager"].includes(r),
    ) || user?.isSuperUser;

  const fetchRequests = useCallback(
    async ({ page, limit }) => {
      try {
        const params = searchRef.current
          ? `&search=${encodeURIComponent(searchRef.current)}`
          : "";
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
    [setAlert],
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
  } = useServerPagination(fetchRequests, { initialPageSize: 10 });

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

  const iconBtn = (color: string, bg: string) => ({
    width: 28,
    height: 28,
    borderRadius: "6px",
    color,
    backgroundColor: bg,
    "&:hover": { backgroundColor: bg.replace("0.12", "0.22") },
  });

  const columns = useMemo(
    () => [
      {
        accessorKey: "employee",
        header: "Employee",
        size: 180,
        Cell: ({ cell }: any) => {
          const emp = cell.getValue();
          return (
            <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
              {emp ? `${emp.first_name} ${emp.last_name}` : "—"}
            </Typography>
          );
        },
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 130,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {dayjs(cell.getValue()).format("DD MMM YYYY")}
          </Typography>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 110,
        Cell: ({ cell }: any) => <StatusChip status={cell.getValue()} />,
      },
      {
        accessorKey: "reason",
        header: "Reason",
        size: 220,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem" color="text.secondary">
            {cell.getValue() ?? "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "wfhActions",
        header: "Actions",
        size: 140,
        enableSorting: false,
        Cell: ({ cell }: any) => {
          const row = cell.row.original;
          if (row.status !== "Pending") return null;
          const isOwn = row.userId === user?.id;
          return (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              {isApprover && !isOwn && (
                <>
                  <Tooltip title="Approve">
                    <IconButton
                      size="small"
                      sx={iconBtn("#059669", "rgba(5,150,105,0.12)")}
                      onClick={() => handleAction(row.id, "approve")}
                    >
                      <CheckIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Reject">
                    <IconButton
                      size="small"
                      sx={iconBtn("#dc2626", "rgba(220,38,38,0.12)")}
                      onClick={() => handleAction(row.id, "reject")}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
              {isOwn && (
                <Tooltip title="Cancel">
                  <IconButton
                    size="small"
                    sx={iconBtn("#64748b", "rgba(100,116,139,0.12)")}
                    onClick={() => handleAction(row.id, "cancel")}
                  >
                    <RemoveCircleIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        },
      },
    ],
    [isApprover, user?.id, handleAction],
  );

  const memoizedData = useMemo(() => data || [], [data]);
  const tableConfig = useTableConfig(memoizedData, columns, loading, {
    enableServerSidePagination: true,
    totalRowCount: totalCount,
    onPaginationChange: handlePaginationChange,
    onPageSizeChange: handlePageSizeChange,
    initialPagination: pagination,
    pageSizeOptions: [5, 10, 25, 50],
  });

  const table = useMaterialReactTable({
    ...tableConfig.table,
    manualFiltering: true,
    state: { ...tableConfig.table.state, isLoading: loading, globalFilter },
    onGlobalFilterChange: handleGlobalFilterChange,
    renderTopToolbarCustomActions: () => (
      <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
        <Box sx={{ flex: 1 }} />
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
    ),
  });

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <MaterialReactTable table={table} />

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
