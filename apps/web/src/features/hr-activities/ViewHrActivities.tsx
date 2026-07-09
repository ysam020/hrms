import {
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import EditHrActivityModal from "./EditHrActivityModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import Skeleton from "@mui/material/Skeleton";
import Chip from "@mui/material/Chip";
import { Dropdown } from "primereact/dropdown";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import InfoIcon from "@mui/icons-material/Info";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import PersonIcon from "@mui/icons-material/Person";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CloseIcon from "@mui/icons-material/Close";
import FilterList from "@mui/icons-material/FilterList";
import dayjs from "dayjs";
import { API_ENDPOINTS } from "@web/shared/constants";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";

function ViewHrActivities({ refreshKey = 0 }) {
  const [activityData, setActivityData] = useState<any>(null);
  const [openModal, setOpenModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Active");
  const [globalFilter, setGlobalFilter] = useState("");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const canEdit = hasPermission(
    "HRActivities",
    "edit",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canDelete = hasPermission(
    "HRActivities",
    "delete",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    id: string | null;
    title: string;
  }>({
    open: false,
    id: null,
    title: "",
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [detailsAnchorEl, setDetailsAnchorEl] = useState<HTMLElement | null>(
    null,
  );
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  const handleOpenModal = (data) => {
    setActivityData(data);
    setOpenModal(true);
  };
  const handleCloseModal = () => setOpenModal(false);

  const handleDetailsClick = (event, activity) => {
    setDetailsAnchorEl(event.currentTarget);
    setSelectedActivity(activity);
  };

  const handleDetailsClose = () => {
    setDetailsAnchorEl(null);
    setSelectedActivity(null);
  };

  const isDetailsPopoverOpen = Boolean(detailsAnchorEl);

  const fetchHrActivities = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        const baseUrl = API_ENDPOINTS.GET_HR_ACTIVITIES(
          page,
          limit,
          statusFilter,
        );
        const url = search
          ? `${baseUrl}&search=${encodeURIComponent(search)}`
          : baseUrl;
        const response = await apiClient(url);

        return {
          data: response.data.data.activities || [],
          totalCount: response.data.data.pagination.totalCount || 0,
        };
      } catch (error) {
        if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError")
          throw error;
        setAlert({
          open: true,
          message: "Failed to fetch HR activities",
          severity: "error",
        });
        throw error;
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
  } = useServerPagination(fetchHrActivities, {
    initialPageSize: 10,
    deps: [statusFilter, refreshKey],
  });

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

  const memoizedData = useMemo(() => data || [], [data]);

  const handleDeleteClick = (id, title) => {
    setDeleteDialog({ open: true, id, title });
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, id: null, title: "" });
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_HR_ACTIVITY(deleteDialog.id!),
      );
      refresh();
      setAlert({
        open: true,
        message: "HR activity deleted successfully",
        severity: "success",
      });
      setDeleteDialog({ open: false, id: null, title: "" });
    } catch (err) {
      setAlert({
        open: true,
        message:
          err.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : err.response?.data?.message || "Something went wrong",
        severity: "error",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = dayjs(timestamp);
    return date.isValid() ? date.format("MMM DD, YYYY • hh:mm A") : "N/A";
  };

  const formatTime = (timeString) => {
    if (!timeString) return "N/A";

    try {
      const [hours, minutes] = timeString.split(":");
      const timeObj = dayjs().hour(parseInt(hours)).minute(parseInt(minutes));
      return timeObj.format("hh:mm A");
    } catch (error) {
      return timeString;
    }
  };

  const getStatusChip = (status) => {
    const statusMap = {
      Active: {
        color: theme === "light" ? "#059669" : "#34d399",
        bg:
          theme === "light"
            ? "rgba(16, 185, 129, 0.15)"
            : "rgba(52, 211, 153, 0.2)",
        label: "Active",
      },
      Expired: {
        color: theme === "light" ? "#d97706" : "#fbbf24",
        bg:
          theme === "light"
            ? "rgba(251, 191, 36, 0.15)"
            : "rgba(251, 191, 36, 0.2)",
        label: "Expired",
      },
      Deleted: {
        color: theme === "light" ? "#dc2626" : "#f87171",
        bg:
          theme === "light"
            ? "rgba(239, 68, 68, 0.15)"
            : "rgba(248, 113, 113, 0.2)",
        label: "Deleted",
      },
    };

    const config = statusMap[status] || statusMap.Active;

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
      { key: "title", label: "Title", primary: true, hideLabel: true },
      { key: "description", label: "Description" },
      {
        key: "date",
        label: "Date",
        render: (row: any) => {
          if (!row.date || typeof row.date !== "string")
            return <Skeleton width={60} />;
          const [year, month, day] = row.date.split("-");
          return `${day}-${month}-${year}`;
        },
      },
      {
        key: "time",
        label: "Time",
        render: (row: any) => formatTime(row.time),
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => getStatusChip(row.status),
      },
    ],
    [],
  );

  const rowActions = useCallback(
    (row: any) => {
      if (row.status === "Deleted") return [];
      const actions: any[] = [];
      if (canEdit) {
        actions.push({
          icon: <EditIcon sx={{ fontSize: 16 }} />,
          label: `Edit HR activity: ${row.title}`,
          color: "primary" as const,
          onClick: () => handleOpenModal(row),
        });
      }
      if (canDelete) {
        actions.push({
          icon: <DeleteIcon sx={{ fontSize: 16 }} />,
          label: `Delete HR activity: ${row.title}`,
          color: "error" as const,
          onClick: () => handleDeleteClick(row.id, row.title),
        });
      }
      actions.push({
        icon: <InfoIcon sx={{ fontSize: 16 }} />,
        label: "View HR activity details",
        onClick: (r: any, e: any) => handleDetailsClick(e, r),
      });
      return actions;
    },
    [canEdit, canDelete],
  );

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="HR activities"
        data={memoizedData}
        columns={columns}
        actions={rowActions}
        loading={loading}
        emptyMessage="No HR activities found"
        search={{
          value: globalFilter,
          onChange: handleGlobalFilterChange,
          placeholder: "Search activities…",
        }}
        toolbarActions={
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FilterList
                sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
              />
              <Typography
                variant="body2"
                fontSize="0.8rem"
                color="text.secondary"
              >
                Filter by status:
              </Typography>
            </Box>
            <Box sx={{ minWidth: 120 }}>
              <Dropdown
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.value)}
                appendTo={() =>
                  document.querySelector("#root .App") as HTMLElement
                }
                options={[
                  { label: "All", value: "All" },
                  { label: "Active", value: "Active" },
                  { label: "Expired", value: "Expired" },
                  { label: "Deleted", value: "Deleted" },
                ]}
                placeholder="Select Status"
                className="w-full"
                style={{ minWidth: "120px" }}
              />
            </Box>
          </Box>
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

      <EditHrActivityModal
        open={openModal}
        handleClose={handleCloseModal}
        activityData={activityData}
        getData={refresh}
      />

      <Popover
        open={isDetailsPopoverOpen}
        anchorEl={detailsAnchorEl}
        onClose={handleDetailsClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        BackdropProps={{
          style: {
            backgroundColor: "transparent",
            backdropFilter: "none",
          },
        }}
        disableScrollLock={true}
        PaperProps={{
          elevation: 8,
          sx: {
            borderRadius: 3,
            minWidth: 320,
            maxWidth: 400,
            overflow: "visible",
            mt: 1,
            "&::before": {
              content: '""',
              display: "block",
              position: "absolute",
              top: 0,
              left: "50%",
              width: 12,
              height: 12,
              bgcolor: "background.paper",
              transform: "translateY(-50%) translateX(-50%) rotate(45deg)",
              zIndex: 0,
              border: "1px solid",
              borderColor: "divider",
              borderBottom: "none",
              borderRight: "none",
            },
          },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 0,
            borderRadius: 3,
            background: "var(--card-background)",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              p: 2,
              pb: 1,
            }}
          >
            <Box sx={{ flex: 1, mr: 1 }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
              >
                <InfoIcon sx={{ color: "#6C5DFC", fontSize: 20 }} />
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    color: "text.primary",
                    fontSize: "1.1rem",
                    lineHeight: 1.3,
                  }}
                >
                  Activity Details
                </Typography>
              </Box>
            </Box>

            <Tooltip title="Close">
              <IconButton
                onClick={handleDetailsClose}
                size="small"
                aria-label="Close details"
                sx={{
                  color: "text.secondary",
                  "&:hover": {
                    backgroundColor: "action.hover",
                  },
                }}
              >
                <CloseIcon aria-hidden="true" fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <Divider sx={{ mx: 2 }} />

          <Box sx={{ p: 2 }}>
            <Box sx={{ mb: 2 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  color: "text.secondary",
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  fontWeight: 600,
                  mb: 0.5,
                }}
              >
                Status
              </Typography>
              {getStatusChip(selectedActivity?.status)}
            </Box>

            <Box sx={{ mb: 2 }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
              >
                <PersonIcon sx={{ color: "#6C5DFC", fontSize: 16 }} />
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    fontWeight: 600,
                  }}
                >
                  Created By
                </Typography>
              </Box>
              <Typography
                variant="body2"
                fontSize="0.8rem"
                sx={{
                  color: "text.primary",
                  ml: 3,
                }}
              >
                {selectedActivity?.createdBy || "N/A"}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
              >
                <AccessTimeIcon sx={{ color: "#6C5DFC", fontSize: 16 }} />
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    fontWeight: 600,
                  }}
                >
                  Created On
                </Typography>
              </Box>
              <Typography
                variant="body2"
                fontSize="0.8rem"
                sx={{
                  color: "text.primary",
                  ml: 3,
                }}
              >
                {formatTimestamp(selectedActivity?.createdOn)}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
              >
                <PersonIcon sx={{ color: "#FF9800", fontSize: 16 }} />
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    fontWeight: 600,
                  }}
                >
                  Last Updated By
                </Typography>
              </Box>
              <Typography
                variant="body2"
                fontSize="0.8rem"
                sx={{
                  color: "text.primary",
                  ml: 3,
                }}
              >
                {selectedActivity?.lastUpdatedBy || "N/A"}
              </Typography>
            </Box>

            <Box>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
              >
                <AccessTimeIcon sx={{ color: "#FF9800", fontSize: 16 }} />
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    fontWeight: 600,
                  }}
                >
                  Last Updated On
                </Typography>
              </Box>
              <Typography
                variant="body2"
                fontSize="0.8rem"
                sx={{
                  color: "text.primary",
                  ml: 3,
                }}
              >
                {formatTimestamp(selectedActivity?.lastUpdatedOn)}
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Popover>
      <ConfirmationDialog
        open={deleteDialog.open}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete HR Activity"
        message={`Are you sure you want to delete "${deleteDialog.title}"?`}
        description="This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        loading={deleteLoading}
        variant="danger"
        theme={theme}
      />
    </ErrorBoundary>
  );
}

export default memo(ViewHrActivities);
