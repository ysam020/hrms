import { memo, useCallback, useContext, useMemo, useState } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
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
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  pending: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  approved: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  rejected: { color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
  disbursed: { color: "#6366f1", bg: "rgba(99,102,241,0.15)" },
  closed: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
};

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status?.toLowerCase()] ?? STATUS_CFG.pending;
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

function SalaryAdvances() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const [openRequest, setOpenRequest] = useState(false);
  const [form, setForm] = useState({ amount: "", emiMonths: 3, reason: "" });
  const [submitting, setSubmitting] = useState(false);

  const isHr =
    user?.role?.some((r: string) => ["owner", "admin", "hr"].includes(r)) ||
    user?.isSuperUser;

  const fetchAdvances = useCallback(
    async ({ page, limit }) => {
      try {
        const res = await apiClient(API_ENDPOINTS.SALARY_ADVANCES(page, limit));
        return {
          data: res.data.data?.advances || res.data.data || [],
          totalCount: res.data.data?.total || 0,
        };
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message: "Failed to fetch advances",
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
  } = useServerPagination(fetchAdvances, { initialPageSize: 10 });

  const handleAction = useCallback(
    async (advanceId: string, status: string) => {
      try {
        await apiClient.patch(API_ENDPOINTS.UPDATE_SALARY_ADVANCE_STATUS, {
          advanceId,
          status,
        });
        refresh();
        setAlert({
          open: true,
          message: `Advance ${status}`,
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

  const handleRequest = useCallback(async () => {
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.REQUEST_SALARY_ADVANCE, {
        ...form,
        amount: Number(form.amount),
        emiMonths: Number(form.emiMonths),
      });
      refresh();
      setOpenRequest(false);
      setForm({ amount: "", emiMonths: 3, reason: "" });
      setAlert({
        open: true,
        message: "Salary advance requested",
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

  const iconBtn = (color: string, bg: string, hoverBg: string) => ({
    width: 28,
    height: 28,
    borderRadius: "6px",
    color,
    backgroundColor: bg,
    "&:hover": { backgroundColor: hoverBg },
  });

  const columns = useMemo(
    () => [
      {
        accessorKey: "userId",
        header: "Employee",
        size: 160,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
            {cell.row.original.user?.first_name
              ? `${cell.row.original.user.first_name} ${cell.row.original.user.last_name}`
              : cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        size: 120,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            ₹{Number(cell.getValue()).toLocaleString("en-IN")}
          </Typography>
        ),
      },
      {
        accessorKey: "emiMonths",
        header: "EMI Months",
        size: 110,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "paidMonths",
        header: "Paid",
        size: 90,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue() ?? 0}
          </Typography>
        ),
      },
      {
        accessorKey: "remainingAmount",
        header: "Remaining",
        size: 120,
        Cell: ({ cell }: any) => (
          <Typography
            variant="body2"
            fontSize="0.8rem"
            color={
              Number(cell.getValue()) > 0 ? "warning.main" : "text.secondary"
            }
          >
            {cell.getValue() != null
              ? `₹${Number(cell.getValue()).toLocaleString("en-IN")}`
              : "—"}
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
        accessorKey: "createdAt",
        header: "Requested",
        size: 130,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {dayjs(cell.getValue()).format("DD MMM YYYY")}
          </Typography>
        ),
      },
      ...(isHr
        ? [
            {
              accessorKey: "hrActions",
              header: "Actions",
              size: 120,
              enableSorting: false,
              Cell: ({ cell }: any) => {
                const row = cell.row.original;
                if (row.status !== "pending") return null;
                return (
                  <Box sx={{ display: "flex", gap: 0.5 }}>
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
                    <Tooltip title="Reject">
                      <IconButton
                        size="small"
                        sx={iconBtn(
                          "#dc2626",
                          "rgba(220,38,38,0.12)",
                          "rgba(220,38,38,0.2)",
                        )}
                        onClick={() => handleAction(row.id, "rejected")}
                      >
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                );
              },
            },
          ]
        : []),
    ],
    [isHr, handleAction],
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
    state: { ...tableConfig.table.state, isLoading: loading },
    renderTopToolbarCustomActions: () => (
      <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Request Salary Advance">
          <span>
            <IconButton
              color="primary"
              size="small"
              onClick={() => setOpenRequest(true)}
              aria-label="Request salary advance"
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
        <DialogTitle>Request Salary Advance</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "16px !important",
          }}
        >
          <TextField
            label="Amount (₹)"
            size="small"
            type="number"
            fullWidth
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <TextField
            label="EMI Months"
            size="small"
            type="number"
            fullWidth
            value={form.emiMonths}
            inputProps={{ min: 1, max: 12 }}
            onChange={(e) =>
              setForm((f) => ({ ...f, emiMonths: Number(e.target.value) }))
            }
          />
          <TextField
            label="Reason"
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
            onClick={handleRequest}
            variant="contained"
            size="small"
            disabled={submitting || !form.amount}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorBoundary>
  );
}

export default memo(SalaryAdvances);
