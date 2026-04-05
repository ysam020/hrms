import React, { useContext, useState, useMemo, useCallback } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Download from "@mui/icons-material/Download";
import FilterList from "@mui/icons-material/FilterList";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import {
  downloadExcel,
  generateFilename,
} from "@web/shared/utils/downloadReport";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Person from "@mui/icons-material/Person";
import { Dropdown } from "primereact/dropdown";
import { API_ENDPOINTS } from "@web/shared/constants";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";

function ViewLeaveApplications() {
  const [statusFilter, setStatusFilter] = useState("All");
  const [showFutureOnly, setShowFutureOnly] = useState(true);
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const { theme } = useContext(ThemeContext);
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
    ],
    [],
  );

  const fetchLeaveApplications = useCallback(
    async ({ page, limit }) => {
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
          status: statusFilter,
          futureOnly: showFutureOnly.toString(),
        });

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
  } = useServerPagination(fetchLeaveApplications, {
    initialPageSize: 10,
    deps: [statusFilter, showFutureOnly],
  });

  const handleLeaveActionClick = useCallback((_id, username, status) => {
    setActionDialog({ open: true, id: _id, username, status });
  }, []);

  const handleLeaveActionConfirm = useCallback(async () => {
    const { id: _id, status } = actionDialog;
    setActionLoading(true);
    try {
      await apiClient.put(API_ENDPOINTS.UPDATE_LEAVE_STATUS, {
        leaveId: _id,
        action: status!.toLowerCase(),
      });
      setActionDialog({ open: false, id: null, username: null, status: null });
      refresh();
      setAlert({
        open: true,
        message: `Leave application ${status!.toLowerCase()}d successfully`,
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

  const handleDownloadExcel = useCallback(async () => {
    try {
      const params = `status=${statusFilter}&futureOnly=${showFutureOnly}`;
      const response = await apiClient(
        API_ENDPOINTS.GET_LEAVE_APPLICATIONS(params),
      );
      const allData = response.data.leaves || response.data.data?.records || [];

      if (!allData || allData.length === 0) {
        setAlert({
          open: true,
          message: "No data available to download.",
          severity: "warning",
        });
        return;
      }

      const exportData = allData.map((item) => ({
        username: item.username,
        from: item.from,
        to: item.to,
        reason: item.reason,
        sickLeave: item.sick_leave,
        status: item.status,
      }));

      const filename = generateFilename("Leave_Applications");

      const columnWidths = {
        Username: 20,
        From: 15,
        To: 15,
        Reason: 30,
        "Sick Leave": 15,
        "Medical Certificate": 20,
        Status: 15,
      };

      await downloadExcel(exportData, filename, "Leave Applications", {
        formatFieldNames: true,
        columnWidths,
      });

      setAlert({
        open: true,
        message: "Download completed successfully",
        severity: "success",
      });
    } catch (error) {
      console.error("Error downloading Excel file:", error);
      setAlert({
        open: true,
        message: "Failed to download Excel file. Please try again.",
        severity: "error",
      });
    }
  }, [statusFilter, showFutureOnly, setAlert]);

  const handleStatusFilterChange = useCallback((e) => {
    setStatusFilter(e.value);
  }, []);

  const handleFutureOnlyToggle = useCallback((event) => {
    setShowFutureOnly(event.target.checked);
  }, []);

  // Get status chip props
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
        accessorKey: "username",
        header: "Username",
        size: 160,
        Cell: ({ cell }) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Person
              sx={{ fontSize: 14, color: "text.secondary", opacity: 0.6 }}
            />
            <Typography variant="body2" fontSize="0.8rem">
              {cell.getValue()}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "from",
        header: "From",
        size: 110,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "to",
        header: "To",
        size: 110,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "reason",
        header: "Reason",
        size: 200,
        Cell: ({ cell }) => (
          <Typography
            variant="body2"
            fontSize="0.8rem"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              opacity: 0.85,
            }}
          >
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 100,
        Cell: ({ cell }) => getStatusChip(cell.getValue()),
      },
      {
        accessorKey: "approve",
        header: "Action",
        size: 120,
        Cell: ({ cell }) => {
          const canTakeAction =
            user?.isSuperUser || cell.row.original.username !== user?.username;

          if (!canTakeAction) {
            return (
              <Typography
                variant="caption"
                fontSize="0.7rem"
                sx={{ color: "text.disabled", fontStyle: "italic" }}
              >
                —
              </Typography>
            );
          }

          return (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Tooltip title="Approve">
                <IconButton
                  size="small"
                  onClick={() =>
                    handleLeaveActionClick(
                      cell.row.original.id || cell.row.original._id,
                      cell.row.original.username,
                      "Approve",
                    )
                  }
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "6px",
                    color: theme === "light" ? "#059669" : "#34d399",
                    backgroundColor:
                      theme === "light"
                        ? "rgba(16, 185, 129, 0.22)"
                        : "rgba(52, 211, 153, 0.25)",
                    "&:hover": {
                      backgroundColor:
                        theme === "light"
                          ? "rgba(16, 185, 129, 0.3)"
                          : "rgba(52, 211, 153, 0.35)",
                    },
                  }}
                >
                  <CheckIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>

              <Tooltip title="Reject">
                <IconButton
                  size="small"
                  onClick={() =>
                    handleLeaveActionClick(
                      cell.row.original.id || cell.row.original._id,
                      cell.row.original.username,
                      "Reject",
                    )
                  }
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "6px",
                    color: theme === "light" ? "#dc2626" : "#f87171",
                    backgroundColor:
                      theme === "light"
                        ? "rgba(239, 68, 68, 0.32)"
                        : "rgba(248, 113, 113, 0.35)",
                    "&:hover": {
                      backgroundColor:
                        theme === "light"
                          ? "rgba(239, 68, 68, 0.4)"
                          : "rgba(248, 113, 113, 0.45)",
                    },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        },
      },
    ],

    [user, handleLeaveActionClick, theme],
  );

  const memoizedData = useMemo(() => data, [data]);

  const tableConfig = useTableConfig(memoizedData, columns, loading, {
    enableServerSidePagination: true,
    totalRowCount: totalCount,
    onPaginationChange: handlePaginationChange,
    onPageSizeChange: handlePageSizeChange,
    initialPagination: pagination,
    pageSizeOptions: [5, 10, 25, 50, 100],
  });

  const table = useMaterialReactTable({
    ...tableConfig.table,
    renderTopToolbarCustomActions: () => (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          width: "100%",
          flexWrap: "wrap",
        }}
      >
        {/* Status Filter */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FilterList
            sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
          />
          <Typography variant="body2" fontSize="0.8rem" color="text.secondary">
            Status:
          </Typography>
        </Box>
        <Box sx={{ minWidth: 120 }}>
          <Dropdown
            value={statusFilter}
            onChange={handleStatusFilterChange}
            options={statusOptions}
            placeholder="Select Status"
            className="w-full"
            style={{ minWidth: "120px" }}
            appendTo={() => document.querySelector("#root .App") as HTMLElement}
          />
        </Box>

        {/* Future Only Toggle */}
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

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Download Button */}
        <Tooltip title="Download Excel">
          <span>
            <IconButton
              onClick={handleDownloadExcel}
              disabled={!data || data.length === 0 || loading}
              color="primary"
              size="small"
            >
              <Download sx={{ fontSize: 20 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    ),
  });

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <MaterialReactTable table={table} />
      </ErrorBoundary>

      <ConfirmationDialog
        open={actionDialog.open}
        onClose={handleLeaveActionCancel}
        onConfirm={handleLeaveActionConfirm}
        title={
          actionDialog.status === "Approve" ? "Approve Leave" : "Reject Leave"
        }
        message={
          actionDialog.status === "Approve"
            ? `Are you sure you want to approve the leave application for ${actionDialog.username}?`
            : `Are you sure you want to reject the leave application for ${actionDialog.username}?`
        }
        confirmText={actionDialog.status === "Approve" ? "Approve" : "Reject"}
        cancelText="Cancel"
        loading={actionLoading}
        variant={actionDialog.status === "Reject" ? "danger" : "default"}
        theme={theme}
      />
    </div>
  );
}

export default React.memo(ViewLeaveApplications);
