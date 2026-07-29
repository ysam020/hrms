import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import FilterList from "@mui/icons-material/FilterList";
import AddIcon from "@mui/icons-material/Add";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import DataList from "@web/shared/components/DataList";
import LeaveApplication from "./LeaveApplication";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Person from "@mui/icons-material/Person";
import { Dropdown } from "primereact/dropdown";
import { API_ENDPOINTS } from "@web/shared/constants";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import formatEmployeeLabel from "@web/shared/utils/formatEmployeeLabel";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";

function ViewLeaveApplications() {
  const [statusFilter, setStatusFilter] = useState("All");
  const [showFutureOnly, setShowFutureOnly] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const { theme } = useContext(ThemeContext);
  const canManageLeave =
    isOwnerOrAdmin(user) ||
    hasPermission(
      "Leave",
      "approve",
      "all",
      user?.isSuperUser,
      user?.permissions || [],
    ) ||
    hasPermission(
      "Leave",
      "approve",
      "team",
      user?.isSuperUser,
      user?.permissions || [],
    ) ||
    hasPermission(
      "Leave",
      "reject",
      "all",
      user?.isSuperUser,
      user?.permissions || [],
    ) ||
    hasPermission(
      "Leave",
      "reject",
      "team",
      user?.isSuperUser,
      user?.permissions || [],
    );
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    id: string | null;
    username: string | null;
    status: string | null;
  }>({
    open: false,
    id: null,
    username: null,
    status: null,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [openApply, setOpenApply] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(
    null,
  );
  const [bulkLoading, setBulkLoading] = useState(false);

  // Deep link support (e.g. the dashboard's "Apply Leave" quick action) —
  // land here with the modal already open instead of just the bare list.
  useEffect(() => {
    if (searchParams.get("action") === "apply") {
      setOpenApply(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("action");
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusOptions = useMemo(
    () => [
      {
        label: "All",
        value: "All",
        icon: "pi pi-list",
        color: "#6C5DFC",
      },
      {
        label: "Pending",
        value: "Pending",
        icon: "pi pi-clock",
        color: "#FF9800",
      },
      {
        label: "Approved",
        value: "Approved",
        icon: "pi pi-check-circle",
        color: "#4CAF50",
      },
      {
        label: "Rejected",
        value: "Rejected",
        icon: "pi pi-times-circle",
        color: "#F44336",
      },
      {
        label: "Cancellation Requested",
        value: "Cancellation Requested",
        icon: "pi pi-exclamation-circle",
        color: "#8B5CF6",
      },
      {
        label: "Cancelled",
        value: "Cancelled",
        icon: "pi pi-ban",
        color: "#9E9E9E",
      },
    ],
    [],
  );

  const fetchLeaveApplications = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
          status: statusFilter,
          futureOnly: showFutureOnly.toString(),
        });
        if (search) params.set("search", search);

        const response = await apiClient(
          API_ENDPOINTS.GET_LEAVE_APPLICATIONS(params.toString()),
        );

        const respData = response.data;
        const records = respData.data?.records ?? respData.data ?? [];
        const total =
          respData.data?.pagination?.totalCount ??
          respData.total ??
          records.length;
        return { data: records, totalCount: total };
      } catch (error) {
        if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError")
          throw error;
        setAlert({
          open: true,
          message: "Failed to fetch leave applications. Please try again.",
          severity: "error",
        });
        throw error;
      }
    },
    [statusFilter, showFutureOnly, setAlert],
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
  } = useServerPagination(fetchLeaveApplications, {
    initialPageSize: 10,
    deps: [statusFilter, showFutureOnly],
  });

  useEffect(() => {
    setSelectedIds([]);
  }, [data]);

  const handleGlobalFilterChange = useCallback(
    (value) => {
      searchRef.current = value ?? "";
      setGlobalFilter(value ?? "");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        resetPagination();
      }, 400);
    },
    [resetPagination],
  );

  const handleLeaveActionClick = useCallback((_id, username, status) => {
    setActionDialog({ open: true, id: _id, username, status });
  }, []);

  const handleLeaveActionConfirm = useCallback(async () => {
    const { id: _id, status } = actionDialog;
    const action = status === "Withdraw" ? "cancel" : status!.toLowerCase();
    setActionLoading(true);
    try {
      const response = await apiClient.put(API_ENDPOINTS.UPDATE_LEAVE_STATUS, {
        leaveId: _id,
        action,
      });
      if (!response.data.success) {
        setAlert({
          open: true,
          message: response.data.message || "An error occurred",
          severity: "error",
        });
        return;
      }
      setActionDialog({ open: false, id: null, username: null, status: null });
      refresh();
      setAlert({
        open: true,
        message:
          status === "Withdraw"
            ? "Leave application withdrawn successfully"
            : `Leave application ${status!.toLowerCase()}d successfully`,
        severity: "success",
      });
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error. Please check your connection and try again."
            : error.response?.data?.message || "An error occurred",
        severity: "error",
      });
    } finally {
      setActionLoading(false);
    }
  }, [actionDialog, setAlert, refresh]);

  const handleLeaveActionCancel = useCallback(() => {
    setActionDialog({ open: false, id: null, username: null, status: null });
  }, []);

  const handleBulkConfirm = useCallback(async () => {
    if (!bulkAction) return;
    setBulkLoading(true);
    try {
      const response = await apiClient.put(
        API_ENDPOINTS.BULK_UPDATE_LEAVE_STATUS,
        { leaveIds: selectedIds, action: bulkAction },
      );
      const failed = response.data?.data?.failed ?? [];
      const succeeded = response.data?.data?.succeeded ?? [];
      refresh();
      setAlert({
        open: true,
        message:
          failed.length > 0
            ? `${succeeded.length} ${bulkAction}d, ${failed.length} failed`
            : response.data.message ||
              `${succeeded.length} leave application(s) ${bulkAction}d`,
        severity: failed.length > 0 ? "warning" : "success",
      });
      setSelectedIds([]);
      setBulkAction(null);
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error. Please check your connection and try again."
            : error.response?.data?.message || "An error occurred",
        severity: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  }, [bulkAction, selectedIds, setAlert, refresh]);

  const handleStatusFilterChange = useCallback((e) => {
    setStatusFilter(e.value);
  }, []);

  const handleFutureOnlyToggle = useCallback((event) => {
    setShowFutureOnly(event.target.checked);
  }, []);

  const getStatusChip = (status) => {
    const statusMap = {
      Pending: {
        color: theme === "light" ? "#d97706" : "#fbbf24",
        bg:
          theme === "light"
            ? "rgba(251, 191, 36, 0.15)"
            : "rgba(251, 191, 36, 0.2)",
        label: "Pending",
      },
      Approved: {
        color: theme === "light" ? "#059669" : "#34d399",
        bg:
          theme === "light"
            ? "rgba(16, 185, 129, 0.15)"
            : "rgba(52, 211, 153, 0.2)",
        label: "Approved",
      },
      Rejected: {
        color: theme === "light" ? "#dc2626" : "#f87171",
        bg:
          theme === "light"
            ? "rgba(239, 68, 68, 0.15)"
            : "rgba(248, 113, 113, 0.2)",
        label: "Rejected",
      },
      "Cancellation Requested": {
        color: theme === "light" ? "#7c3aed" : "#a78bfa",
        bg:
          theme === "light"
            ? "rgba(139, 92, 246, 0.15)"
            : "rgba(167, 139, 250, 0.2)",
        label: "Cancellation Requested",
      },
      Cancelled: {
        color: theme === "light" ? "#6b7280" : "#9ca3af",
        bg:
          theme === "light"
            ? "rgba(107, 114, 128, 0.15)"
            : "rgba(156, 163, 175, 0.2)",
        label: "Cancelled",
      },
    };

    const config = statusMap[status] || statusMap.Pending;

    return (
      <Chip
        label={config.label}
        size="small"
        sx={{
          backgroundColor: config.bg,
          color: config.color,
          fontWeight: 500,
          fontSize: "0.7rem",
          height: "22px",
          borderRadius: "4px",
          "& .MuiChip-label": {
            padding: "0 8px",
          },
        }}
      />
    );
  };

  const columns = useMemo(
    () => [
      {
        key: "username",
        label: "Username",
        primary: true,
        hideLabel: true,
        render: (row: any) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Person
              sx={{ fontSize: 14, color: "text.secondary", opacity: 0.6 }}
            />
            <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
              {formatEmployeeLabel(
                `${row.firstName ?? ""} ${row.lastName ?? ""}`,
                row.username,
              )}
            </Typography>
          </Box>
        ),
      },
      {
        key: "from",
        label: "From",
        render: (row: any) =>
          row.from ? dayjs(row.from).format("DD MMM YYYY") : "—",
      },
      {
        key: "to",
        label: "To",
        render: (row: any) =>
          row.to ? dayjs(row.to).format("DD MMM YYYY") : "—",
      },
      { key: "reason", label: "Reason" },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => getStatusChip(row.status),
      },
    ],
    [],
  );

  const isPrivilegedUser = isOwnerOrAdmin(user);

  const rowActions = useCallback(
    (row: any) => {
      const actions: any[] = [];
      const canTakeAction =
        canManageLeave && (user?.isSuperUser || row.userId !== user?.id);
      if (canTakeAction) {
        actions.push(
          {
            icon: <CheckIcon sx={{ fontSize: 16 }} aria-hidden="true" />,
            label: `Approve leave for ${row.username}`,
            color: "success" as const,
            onClick: () =>
              handleLeaveActionClick(
                row.id || row._id,
                row.username,
                "Approve",
              ),
          },
          {
            icon: <CloseIcon sx={{ fontSize: 16 }} aria-hidden="true" />,
            label: `Reject leave for ${row.username}`,
            color: "error" as const,
            onClick: () =>
              handleLeaveActionClick(row.id || row._id, row.username, "Reject"),
          },
        );
      }
      const isOwn = row.userId === user?.id;
      const canWithdraw =
        (isOwn || isPrivilegedUser) &&
        ["Pending", "Approved"].includes(row.status);
      if (canWithdraw) {
        actions.push({
          icon: (
            <RemoveCircleOutlineIcon sx={{ fontSize: 16 }} aria-hidden="true" />
          ),
          label: `Withdraw leave for ${row.username}`,
          color: "error" as const,
          onClick: () =>
            handleLeaveActionClick(row.id || row._id, row.username, "Withdraw"),
        });
      }
      return actions;
    },
    [user, handleLeaveActionClick, canManageLeave, isPrivilegedUser],
  );

  const canBulkActOnRow = useCallback(
    (row: any) =>
      canManageLeave &&
      row.status === "Pending" &&
      (user?.isSuperUser || row.userId !== user?.id),
    [canManageLeave, user],
  );

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <DataList
          ariaLabel="Leave applications"
          data={data || []}
          columns={columns}
          getRowId={(row: any) => row.id || row._id}
          actions={rowActions}
          loading={loading}
          emptyMessage="No leave applications found"
          search={{
            value: globalFilter,
            onChange: handleGlobalFilterChange,
            placeholder: "Search employees…",
          }}
          selection={
            canManageLeave
              ? {
                  selectedIds,
                  onChange: setSelectedIds,
                  isRowSelectable: canBulkActOnRow,
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
                    aria-label="Approve selected leave applications"
                  >
                    <CheckIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Reject selected">
                  <IconButton
                    onClick={() => setBulkAction("reject")}
                    color="error"
                    size="small"
                    aria-label="Reject selected leave applications"
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
                    <RemoveCircleOutlineIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <FilterList
                  sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
                />
                <Box sx={{ minWidth: 120 }}>
                  <Dropdown
                    value={statusFilter}
                    onChange={handleStatusFilterChange}
                    options={statusOptions}
                    placeholder="Select Status"
                    className="w-full"
                    style={{ minWidth: "120px" }}
                    appendTo={() =>
                      document.querySelector("#root .App") as HTMLElement
                    }
                  />
                </Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={showFutureOnly}
                      onChange={handleFutureOnlyToggle}
                      color="primary"
                      size="small"
                    />
                  }
                  label={
                    <Typography
                      variant="body2"
                      fontSize="0.8rem"
                      color="text.secondary"
                    >
                      Future leaves only
                    </Typography>
                  }
                  sx={{ margin: 0 }}
                />
                <Tooltip title="Apply for Leave">
                  <IconButton
                    onClick={() => setOpenApply(true)}
                    color="primary"
                    size="small"
                    aria-label="Apply for leave"
                  >
                    <AddIcon sx={{ fontSize: 20 }} aria-hidden="true" />
                  </IconButton>
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
            pageSizeOptions: [5, 10, 25, 50, 100],
          }}
        />
      </ErrorBoundary>

      <ConfirmationDialog
        open={actionDialog.open}
        onClose={handleLeaveActionCancel}
        onConfirm={handleLeaveActionConfirm}
        title={
          actionDialog.status === "Approve"
            ? "Approve Leave"
            : actionDialog.status === "Withdraw"
              ? "Withdraw Leave"
              : "Reject Leave"
        }
        message={
          actionDialog.status === "Approve"
            ? `Are you sure you want to approve the leave application for ${actionDialog.username}?`
            : actionDialog.status === "Withdraw"
              ? `Are you sure you want to withdraw the leave application for ${actionDialog.username}?`
              : `Are you sure you want to reject the leave application for ${actionDialog.username}?`
        }
        confirmText={
          actionDialog.status === "Approve"
            ? "Approve"
            : actionDialog.status === "Withdraw"
              ? "Withdraw"
              : "Reject"
        }
        cancelText="Cancel"
        loading={actionLoading}
        variant={actionDialog.status === "Reject" ? "danger" : "default"}
        theme={theme}
      />

      <ConfirmationDialog
        open={!!bulkAction}
        onClose={() => !bulkLoading && setBulkAction(null)}
        onConfirm={handleBulkConfirm}
        title={
          bulkAction === "approve"
            ? "Approve Leave Applications"
            : "Reject Leave Applications"
        }
        message={`Are you sure you want to ${bulkAction} ${selectedIds.length} selected leave application(s)?`}
        confirmText={bulkAction === "approve" ? "Approve" : "Reject"}
        cancelText="Cancel"
        loading={bulkLoading}
        variant={bulkAction === "approve" ? "default" : "danger"}
        theme={theme}
      />

      <Dialog
        open={openApply}
        onClose={() => setOpenApply(false)}
        disablePortal
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Apply for Leave</DialogTitle>
        <DialogContent>
          <LeaveApplication
            onSuccess={() => {
              setOpenApply(false);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default memo(ViewLeaveApplications);
