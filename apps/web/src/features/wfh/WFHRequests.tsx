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
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitleWithClose from "@web/shared/components/DialogTitleWithClose";
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
import Person from "@mui/icons-material/Person";
import { API_ENDPOINTS } from "@web/shared/constants";
import { ignoreBackdropClick } from "@web/shared/utils/dialogClose";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import formatEmployeeLabel from "@web/shared/utils/formatEmployeeLabel";

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
  // Kept separate from the submission payload (below) — a controlled
  // PrimeReact range Calendar must see its own in-progress selection
  // (start picked, end still null) verbatim. Collapsing that null into
  // `start` for the controlled `value` makes PrimeReact think the range is
  // already complete, so the next click starts a new range instead of
  // extending it.
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    dayjs().add(1, "day").toDate(),
    null,
  ]);
  const [form, setForm] = useState({ reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    action: "approve" | "reject" | "cancel";
    label?: string;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(
    null,
  );
  const [bulkLoading, setBulkLoading] = useState(false);

  const isApprover =
    isHrOrAbove(user) ||
    hasPermission(
      "WFH",
      "approve",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );

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
          totalCount: res.data.total || 0,
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
    const [start, end] = dateRange;
    if (!start) return;
    const date = dayjs(start).format("YYYY-MM-DD");
    // A single click (no second click to pick an end) leaves `end` null —
    // that's a valid single-day request, not an incomplete one.
    const toDate = end ? dayjs(end).format("YYYY-MM-DD") : date;

    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.REQUEST_WFH, {
        date,
        toDate,
        reason: form.reason,
      });
      refresh();
      setOpenRequest(false);
      setDateRange([dayjs().add(1, "day").toDate(), null]);
      setForm({ reason: "" });
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
  }, [dateRange, form.reason, refresh, setAlert]);

  const columns = useMemo(
    () => [
      {
        key: "employee",
        label: "Employee",
        primary: true,
        hideLabel: true,
        render: (row: any) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Person
              sx={{ fontSize: 14, color: "text.secondary", opacity: 0.6 }}
            />
            <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
              {row.employee
                ? formatEmployeeLabel(
                    `${row.employee.first_name ?? ""} ${row.employee.last_name ?? ""}`,
                    row.employee.username,
                  )
                : "—"}
            </Typography>
          </Box>
        ),
      },
      {
        key: "date",
        label: "From",
        render: (row: any) => dayjs(row.date).format("DD MMM YYYY"),
      },
      {
        key: "toDate",
        label: "To",
        render: (row: any) =>
          dayjs(row.toDate ?? row.date).format("DD MMM YYYY"),
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
      // Superusers may approve/reject their own request — everyone else
      // must not be the requester (backend enforces this too, via the
      // approval-engine's allowOverride flag on superuser actions).
      const label = row.employee
        ? `${row.employee.first_name} ${row.employee.last_name}`
        : undefined;
      if (isApprover && (!isOwn || user?.isSuperUser)) {
        actions.push(
          {
            icon: <CheckIcon sx={{ fontSize: 16 }} />,
            label: "Approve",
            color: "success" as const,
            onClick: () =>
              setConfirmTarget({ id: row.id, action: "approve", label }),
          },
          {
            icon: <CloseIcon sx={{ fontSize: 16 }} />,
            label: "Reject",
            color: "error" as const,
            onClick: () =>
              setConfirmTarget({ id: row.id, action: "reject", label }),
          },
        );
      }
      if (isOwn) {
        actions.push({
          icon: <RemoveCircleIcon sx={{ fontSize: 16 }} />,
          label: "Cancel",
          onClick: () =>
            setConfirmTarget({ id: row.id, action: "cancel", label }),
        });
      }
      return actions;
    },
    [isApprover, user?.id],
  );

  const handleConfirmAction = useCallback(async () => {
    if (!confirmTarget) return;
    setConfirmLoading(true);
    try {
      await handleAction(confirmTarget.id, confirmTarget.action);
      setConfirmTarget(null);
    } finally {
      setConfirmLoading(false);
    }
  }, [confirmTarget, handleAction]);

  const handleCancelConfirm = useCallback(() => {
    if (confirmLoading) return;
    setConfirmTarget(null);
  }, [confirmLoading]);

  const memoizedData = useMemo(() => data || [], [data]);

  useEffect(() => {
    setSelectedIds([]);
  }, [data]);

  const isRowBulkSelectable = useCallback(
    (row: any) => {
      if (row.status !== "Pending") return false;
      const isOwn = row.userId === user?.id;
      return isApprover && (!isOwn || user?.isSuperUser);
    },
    [isApprover, user?.id, user?.isSuperUser],
  );

  const handleBulkConfirm = useCallback(async () => {
    if (!bulkAction) return;
    setBulkLoading(true);
    try {
      const res = await apiClient.patch(API_ENDPOINTS.BULK_UPDATE_WFH_STATUS, {
        requestIds: selectedIds,
        action: bulkAction,
      });
      const failed = res.data?.data?.failed ?? [];
      const succeeded = res.data?.data?.succeeded ?? [];
      refresh();
      setAlert({
        open: true,
        message:
          failed.length > 0
            ? `${succeeded.length} ${bulkAction}d, ${failed.length} failed`
            : res.data.message ||
              `${succeeded.length} request(s) ${bulkAction}d`,
        severity: failed.length > 0 ? "warning" : "success",
      });
      setSelectedIds([]);
      setBulkAction(null);
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Action failed",
        severity: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  }, [bulkAction, selectedIds, refresh, setAlert]);

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="WFH requests"
        data={memoizedData}
        columns={columns}
        getRowId={(row: any) => row.id}
        actions={rowActions}
        loading={loading}
        emptyMessage="No WFH requests found"
        search={{
          value: globalFilter,
          onChange: handleGlobalFilterChange,
          placeholder: "Search…",
        }}
        selection={
          isApprover
            ? {
                selectedIds,
                onChange: setSelectedIds,
                isRowSelectable: isRowBulkSelectable,
              }
            : undefined
        }
        toolbarActions={
          selectedIds.length > 0 ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {selectedIds.length} selected
              </Typography>
              <Tooltip title="Approve selected">
                <IconButton
                  onClick={() => setBulkAction("approve")}
                  color="success"
                  size="small"
                  aria-label="Approve selected WFH requests"
                >
                  <CheckIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reject selected">
                <IconButton
                  onClick={() => setBulkAction("reject")}
                  color="error"
                  size="small"
                  aria-label="Reject selected WFH requests"
                >
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear selection">
                <IconButton
                  onClick={() => setSelectedIds([])}
                  size="small"
                  aria-label="Clear selection"
                >
                  <RemoveCircleIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Box>
          ) : (
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
          )
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
        onClose={ignoreBackdropClick(() => setOpenRequest(false))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitleWithClose onClose={() => setOpenRequest(false)}>
          Request WFH
        </DialogTitleWithClose>
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
              Date (select a range for multiple days)
            </Typography>
            <Calendar
              selectionMode="range"
              value={dateRange}
              onChange={(e) =>
                setDateRange(
                  (e.value as [Date | null, Date | null]) ?? [null, null],
                )
              }
              dateFormat="dd/mm/yy"
              minDate={new Date()}
              showIcon
              showButtonBar
              appendTo={document.body}
              placeholder="Select date(s)"
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
          <Button
            variant="ghost"
            onClick={() => setOpenRequest(false)}
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="primary"
            size="small"
            disabled={submitting || !dateRange[0]}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!confirmTarget}
        onClose={handleCancelConfirm}
        onConfirm={handleConfirmAction}
        title={
          confirmTarget?.action === "approve"
            ? "Approve WFH Request"
            : confirmTarget?.action === "reject"
              ? "Reject WFH Request"
              : "Cancel WFH Request"
        }
        message={
          confirmTarget?.action === "approve"
            ? `Are you sure you want to approve the WFH request${confirmTarget?.label ? ` for ${confirmTarget.label}` : ""}?`
            : confirmTarget?.action === "reject"
              ? `Are you sure you want to reject the WFH request${confirmTarget?.label ? ` for ${confirmTarget.label}` : ""}?`
              : `Are you sure you want to cancel this WFH request${confirmTarget?.label ? ` for ${confirmTarget.label}` : ""}?`
        }
        confirmText={
          confirmTarget?.action === "approve"
            ? "Approve"
            : confirmTarget?.action === "reject"
              ? "Reject"
              : "Cancel Request"
        }
        loading={confirmLoading}
        variant={confirmTarget?.action === "approve" ? "default" : "danger"}
      />

      <ConfirmationDialog
        open={!!bulkAction}
        onClose={() => !bulkLoading && setBulkAction(null)}
        onConfirm={handleBulkConfirm}
        title={
          bulkAction === "approve"
            ? "Approve WFH Requests"
            : "Reject WFH Requests"
        }
        message={`Are you sure you want to ${bulkAction} ${selectedIds.length} selected WFH request(s)?`}
        confirmText={bulkAction === "approve" ? "Approve" : "Reject"}
        loading={bulkLoading}
        variant={bulkAction === "approve" ? "default" : "danger"}
      />
    </ErrorBoundary>
  );
}

export default memo(WFHRequests);
