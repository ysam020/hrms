import { memo, useCallback, useContext, useMemo, useState } from "react";
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
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import FilterList from "@mui/icons-material/FilterList";
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Pending", value: "Pending" },
  { label: "Approved", value: "Approved" },
  { label: "Rejected", value: "Rejected" },
  { label: "Repaying", value: "Repaying" },
  { label: "Repaid", value: "Repaid" },
];

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
  const { user } = useContext(UserContext);
  const [openRequest, setOpenRequest] = useState(false);
  const [form, setForm] = useState({ amount: "", emiMonths: 3, reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");

  const isHr =
    user?.role?.some((r: string) => ["owner", "admin", "hr"].includes(r)) ||
    user?.isSuperUser;

  const fetchAdvances = useCallback(
    async ({ page, limit }) => {
      try {
        const params =
          statusFilter && statusFilter !== "All"
            ? `&status=${statusFilter}`
            : "";
        const res = await apiClient(
          API_ENDPOINTS.SALARY_ADVANCES(page, limit, params),
        );
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
  } = useServerPagination(fetchAdvances, {
    initialPageSize: 10,
    deps: [statusFilter],
  });

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

  const columns = useMemo(
    () => [
      {
        key: "userId",
        label: "Employee",
        primary: true,
        hideLabel: true,
        render: (row: any) =>
          row.user?.first_name
            ? `${row.user.first_name} ${row.user.last_name}`
            : row.userId,
      },
      {
        key: "amount",
        label: "Amount",
        render: (row: any) => `₹${Number(row.amount).toLocaleString("en-IN")}`,
      },
      { key: "emiMonths", label: "EMI Months" },
      {
        key: "paidMonths",
        label: "Paid",
        render: (row: any) => row.paidMonths ?? 0,
      },
      {
        key: "remainingAmount",
        label: "Remaining",
        render: (row: any) => (
          <Box
            component="span"
            sx={{
              color:
                Number(row.remainingAmount) > 0
                  ? "warning.main"
                  : "text.secondary",
            }}
          >
            {row.remainingAmount != null
              ? `₹${Number(row.remainingAmount).toLocaleString("en-IN")}`
              : "—"}
          </Box>
        ),
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => <StatusChip status={row.status} />,
      },
      {
        key: "createdAt",
        label: "Requested",
        render: (row: any) => dayjs(row.createdAt).format("DD MMM YYYY"),
      },
    ],
    [],
  );

  const rowActions = useCallback(
    (row: any) => {
      if (!isHr || row.status !== "pending") return [];
      return [
        {
          icon: <CheckIcon sx={{ fontSize: 16 }} />,
          label: "Approve",
          color: "success" as const,
          onClick: () => handleAction(row.id, "approved"),
        },
        {
          icon: <CloseIcon sx={{ fontSize: 16 }} />,
          label: "Reject",
          color: "error" as const,
          onClick: () => handleAction(row.id, "rejected"),
        },
      ];
    },
    [isHr, handleAction],
  );

  const memoizedData = useMemo(() => data || [], [data]);

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="Salary advances"
        data={memoizedData}
        columns={columns}
        actions={rowActions}
        loading={loading}
        emptyMessage="No salary advances found"
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
          <Button
            variant="ghost"
            onClick={() => setOpenRequest(false)}
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRequest}
            variant="primary"
            size="small"
            disabled={submitting || !form.amount}
            loading={submitting}
            loadingText="Submitting…"
          >
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorBoundary>
  );
}

export default memo(SalaryAdvances);
