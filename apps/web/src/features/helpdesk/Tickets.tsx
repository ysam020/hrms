import {
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { Dropdown } from "primereact/dropdown";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
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
import Grid from "@mui/material/Grid";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AddIcon from "@mui/icons-material/Add";
import FilterList from "@mui/icons-material/FilterList";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Resolved", value: "resolved" },
  { label: "Closed", value: "closed" },
];

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

// Must match createTicketSchema/updateTicketSchema's category enum
// (apps/api-gateway/src/schemas.ts) exactly — selecting a value not in the
// backend enum fails validation on submit.
const CATEGORIES = ["IT", "Payroll", "Leave", "Onboarding", "HR", "Other"];
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
  const [statusFilter, setStatusFilter] = useState("All");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTickets = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        let params = search ? `&search=${encodeURIComponent(search)}` : "";
        if (statusFilter && statusFilter !== "All") {
          params += `&status=${statusFilter}`;
        }
        const res = await apiClient(API_ENDPOINTS.TICKETS(page, limit, params));
        return {
          data: res.data.data?.tickets || res.data.data || [],
          totalCount: res.data.total || 0,
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
  } = useServerPagination(fetchTickets, {
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
        key: "ticketNo",
        label: "Ticket #",
        primary: true,
        hideLabel: true,
        render: (row: any) => (
          <Typography
            variant="body2"
            fontSize="0.8rem"
            fontWeight={700}
            sx={{ fontFamily: "monospace", color: "#6366f1" }}
          >
            {row.ticketNo}
          </Typography>
        ),
      },
      {
        key: "title",
        label: "Title",
        render: (row: any) => (
          <>
            {row.title}
            {row.slaBreached && (
              <WarningAmberIcon
                sx={{
                  fontSize: 14,
                  color: "#dc2626",
                  ml: 0.5,
                  verticalAlign: "middle",
                }}
              />
            )}
          </>
        ),
      },
      { key: "category", label: "Category" },
      {
        key: "priority",
        label: "Priority",
        hideLabel: true,
        render: (row: any) => (
          <StatusChip status={row.priority} cfg={PRIORITY_CFG} />
        ),
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => (
          <StatusChip status={row.status} cfg={STATUS_CFG} />
        ),
      },
      {
        key: "raisedByUser",
        label: "Raised By",
        render: (row: any) =>
          row.raisedByUser
            ? `${row.raisedByUser.first_name} ${row.raisedByUser.last_name}`
            : "—",
      },
      {
        key: "slaDeadline",
        label: "SLA Deadline",
        render: (row: any) => {
          if (!row.slaDeadline) return "—";
          const isPast = dayjs(row.slaDeadline).isBefore(dayjs());
          return (
            <Typography
              component="span"
              variant="caption"
              color={isPast ? "error.main" : "text.secondary"}
              fontWeight={500}
            >
              {dayjs(row.slaDeadline).format("DD MMM, HH:mm")}
            </Typography>
          );
        },
      },
    ],
    [],
  );

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="Support tickets"
        data={data || []}
        columns={columns}
        loading={loading}
        emptyMessage="No tickets found"
        onRowClick={(row: any) => navigate(`/helpdesk/${row.id}`)}
        search={{
          value: globalFilter,
          onChange: handleGlobalFilterChange,
          placeholder: "Search tickets…",
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
          <Button
            variant="ghost"
            onClick={() => setOpenCreate(false)}
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            variant="primary"
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
