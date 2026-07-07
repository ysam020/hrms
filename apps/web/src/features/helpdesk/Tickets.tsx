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
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AddIcon from "@mui/icons-material/Add";
import VisibilityIcon from "@mui/icons-material/Visibility";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  open: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  in_progress: { color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  resolved: { color: "#6366f1", bg: "rgba(99,102,241,0.15)" },
  closed: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
};

const PRIORITY_CFG: Record<string, { color: string; bg: string }> = {
  critical: { color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
  high: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  medium: { color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  low: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
};

function StatusChip({
  status,
  cfg,
}: {
  status: string;
  cfg: Record<string, { color: string; bg: string }>;
}) {
  const c = cfg[status] ?? { color: "#64748b", bg: "rgba(100,116,139,0.15)" };
  const label = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        backgroundColor: c.bg,
        color: c.color,
        fontWeight: 600,
        fontSize: "0.7rem",
        height: 22,
        borderRadius: "4px",
        "& .MuiChip-label": { padding: "0 8px" },
      }}
    />
  );
}

const CATEGORIES = ["IT", "HR", "Finance", "Facilities", "Security", "Other"];
const PRIORITIES = ["low", "medium", "high", "critical"];

function Tickets() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const navigate = useNavigate();
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "IT",
    priority: "medium",
  });
  const [submitting, setSubmitting] = useState(false);
  const [globalFilter, setGlobalFilter] = useState("");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTickets = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        const params = search ? `&search=${encodeURIComponent(search)}` : "";
        const res = await apiClient(API_ENDPOINTS.TICKETS(page, limit, params));
        return {
          data: res.data.data?.tickets || res.data.data || [],
          totalCount: res.data.data?.total || 0,
        };
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message: "Failed to fetch tickets",
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
  } = useServerPagination(fetchTickets, { initialPageSize: 10 });

  const handleGlobalFilterChange = useCallback(
    (value: string) => {
      searchRef.current = value ?? "";
      setGlobalFilter(value ?? "");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => resetPagination(), 400);
    },
    [resetPagination],
  );

  const handleCreate = useCallback(async () => {
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.CREATE_TICKET, form);
      refresh();
      setOpenCreate(false);
      setForm({
        title: "",
        description: "",
        category: "IT",
        priority: "medium",
      });
      setAlert({ open: true, message: "Ticket created", severity: "success" });
    } catch (err) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Failed to create ticket",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, refresh, setAlert]);

  const columns = useMemo(
    () => [
      {
        accessorKey: "ticketNo",
        header: "Ticket #",
        size: 120,
        Cell: ({ cell }: any) => (
          <Typography
            variant="body2"
            fontSize="0.8rem"
            fontWeight={700}
            sx={{ fontFamily: "monospace", color: "#6366f1" }}
          >
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "title",
        header: "Title",
        size: 240,
        Cell: ({ cell }: any) => (
          <Typography
            variant="body2"
            fontSize="0.8rem"
            fontWeight={500}
            sx={{ cursor: "pointer", "&:hover": { color: "#6366f1" } }}
            onClick={() => navigate(`/helpdesk/${cell.row.original.id}`)}
          >
            {cell.getValue()}
            {cell.row.original.slaBreached && (
              <WarningAmberIcon
                sx={{
                  fontSize: 14,
                  color: "#dc2626",
                  ml: 0.5,
                  verticalAlign: "middle",
                }}
              />
            )}
          </Typography>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        size: 110,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
        size: 100,
        Cell: ({ cell }: any) => (
          <StatusChip status={cell.getValue()} cfg={PRIORITY_CFG} />
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        Cell: ({ cell }: any) => (
          <StatusChip status={cell.getValue()} cfg={STATUS_CFG} />
        ),
      },
      {
        accessorKey: "raisedByUser",
        header: "Raised By",
        size: 160,
        Cell: ({ cell }: any) => {
          const u = cell.getValue();
          return (
            <Typography variant="body2" fontSize="0.8rem">
              {u ? `${u.first_name} ${u.last_name}` : "—"}
            </Typography>
          );
        },
      },
      {
        accessorKey: "slaDeadline",
        header: "SLA Deadline",
        size: 140,
        Cell: ({ cell }: any) => {
          const date = cell.getValue();
          if (!date)
            return (
              <Typography variant="body2" fontSize="0.8rem">
                —
              </Typography>
            );
          const isPast = dayjs(date).isBefore(dayjs());
          return (
            <Typography
              variant="body2"
              fontSize="0.8rem"
              color={isPast ? "error.main" : "text.primary"}
            >
              {dayjs(date).format("DD MMM, HH:mm")}
            </Typography>
          );
        },
      },
      {
        accessorKey: "ticketView",
        header: "View",
        size: 80,
        enableSorting: false,
        Cell: ({ cell }: any) => (
          <Tooltip title="View Ticket">
            <IconButton
              size="small"
              sx={{
                width: 28,
                height: 28,
                borderRadius: "6px",
                color: "#6366f1",
                backgroundColor: "rgba(99,102,241,0.12)",
                "&:hover": { backgroundColor: "rgba(99,102,241,0.2)" },
              }}
              onClick={() => navigate(`/helpdesk/${cell.row.original.id}`)}
            >
              <VisibilityIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        ),
      },
    ],
    [navigate],
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
        <Tooltip title="Raise Ticket">
          <span>
            <IconButton
              color="primary"
              size="small"
              onClick={() => setOpenCreate(true)}
              aria-label="Raise support ticket"
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
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Raise Support Ticket</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Title"
                size="small"
                fullWidth
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                select
                label="Category"
                size="small"
                fullWidth
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
              >
                {CATEGORIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                select
                label="Priority"
                size="small"
                fullWidth
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value }))
                }
              >
                {PRIORITIES.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                size="small"
                multiline
                rows={4}
                fullWidth
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreate(false)} size="small">
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            size="small"
            disabled={submitting || !form.title || !form.description}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorBoundary>
  );
}

export default memo(Tickets);
