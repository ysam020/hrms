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
import { Calendar } from "primereact/calendar";
import dayjs from "dayjs";
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
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CheckIcon from "@mui/icons-material/Check";
import CancelIcon from "@mui/icons-material/Cancel";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import AddIcon from "@mui/icons-material/Add";
import { API_ENDPOINTS } from "@web/shared/constants";

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

function PayrollRuns() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const [openInitiate, setOpenInitiate] = useState(false);

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHr =
    user?.role?.some((r: string) => ["owner", "admin", "hr"].includes(r)) ||
    user?.isSuperUser;

  const fetchRuns = useCallback(
    async ({ page, limit }) => {
      try {
        const res = await apiClient(API_ENDPOINTS.PAYROLL_RUNS(page, limit));
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
  } = useServerPagination(fetchRuns, { initialPageSize: 10 });

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

  const iconBtn = (color: string, bg: string, hoverBg: string) => ({
    width: 28,
    height: 28,
    borderRadius: "6px",
    color: theme === "light" ? color : color,
    backgroundColor: bg,
    "&:hover": { backgroundColor: hoverBg },
  });

  const columns = useMemo(
    () => [
      {
        accessorKey: "month",
        header: "Period",
        size: 130,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
            {dayjs(
              new Date(
                cell.row.original.year,
                (cell.row.original.month ?? 1) - 1,
              ),
            ).format("MMMM YYYY")}
          </Typography>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        Cell: ({ cell }: any) => <StatusChip status={cell.getValue()} />,
      },
      {
        accessorKey: "employeeCount",
        header: "Employees",
        size: 110,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue() ?? "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "totalGross",
        header: "Total Gross",
        size: 130,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue() != null
              ? `₹${Number(cell.getValue()).toLocaleString("en-IN")}`
              : "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "totalNet",
        header: "Total Net",
        size: 130,
        Cell: ({ cell }: any) => (
          <Typography
            variant="body2"
            fontSize="0.8rem"
            fontWeight={500}
            color="success.main"
          >
            {cell.getValue() != null
              ? `₹${Number(cell.getValue()).toLocaleString("en-IN")}`
              : "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Initiated On",
        size: 140,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()
              ? dayjs(cell.getValue()).format("DD MMM YYYY")
              : "—"}
          </Typography>
        ),
      },
      ...(isHr
        ? [
            {
              accessorKey: "actions",
              header: "Actions",
              size: 160,
              enableSorting: false,
              Cell: ({ cell }: any) => {
                const row = cell.row.original;
                return (
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    {row.status === "draft" && (
                      <Tooltip title="Submit for Approval">
                        <IconButton
                          size="small"
                          sx={iconBtn(
                            "#6366f1",
                            "rgba(99,102,241,0.12)",
                            "rgba(99,102,241,0.2)",
                          )}
                          onClick={() => handleAction(row.id, "processing")}
                        >
                          <PlayArrowIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {row.status === "processing" && (
                      <Tooltip title="Approve">
                        <IconButton
                          size="small"
                          sx={iconBtn(
                            "#059669",
                            "rgba(5,150,105,0.12)",
                            "rgba(5,150,105,0.2)",
                          )}
                          onClick={() => handleAction(row.id, "approved")}
                        >
                          <CheckIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {row.status === "approved" && (
                      <Tooltip title="Mark Disbursed">
                        <IconButton
                          size="small"
                          sx={iconBtn(
                            "#6366f1",
                            "rgba(99,102,241,0.12)",
                            "rgba(99,102,241,0.2)",
                          )}
                          onClick={() => handleAction(row.id, "disbursed")}
                        >
                          <CheckIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {["draft", "processing"].includes(row.status) && (
                      <Tooltip title="Cancel">
                        <IconButton
                          size="small"
                          sx={iconBtn(
                            "#dc2626",
                            "rgba(220,38,38,0.12)",
                            "rgba(220,38,38,0.2)",
                          )}
                          onClick={() => handleAction(row.id, "cancelled")}
                        >
                          <CancelIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                );
              },
            },
          ]
        : []),
    ],
    [isHr, handleAction, theme],
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
    ),
  });

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <MaterialReactTable table={table} />

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
          <Button onClick={() => setOpenInitiate(false)} size="small">
            Cancel
          </Button>
          <Button
            onClick={handleInitiate}
            variant="contained"
            size="small"
            disabled={submitting}
          >
            {submitting ? "Initiating…" : "Initiate"}
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorBoundary>
  );
}

export default memo(PayrollRuns);
