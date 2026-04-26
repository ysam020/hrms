import React, { useState, useMemo, useContext } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import EditHrActivityModal from "./EditHrActivityModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
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
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
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

  const fetchHrActivities = React.useCallback(
    async ({ page, limit }) => {
      try {
        const response = await apiClient(
          API_ENDPOINTS.GET_HR_ACTIVITIES(page, limit, statusFilter),
        );

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
  } = useServerPagination(fetchHrActivities, {
    initialPageSize: 10,
    deps: [statusFilter],
  });

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
      {
        accessorKey: "title",
        header: "Title",
        size: 300,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        size: 300,
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
            }}
          >
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 120,
        Cell: ({ cell }) => {
          const date = cell.getValue();
          if (!date || typeof date !== "string") {
            return <Skeleton width="50%" />;
          }
          const [year, month, day] = date.split("-");
          return (
            <Typography variant="body2" fontSize="0.8rem">
              {`${day}-${month}-${year}`}
            </Typography>
          );
        },
      },
      {
        accessorKey: "time",
        header: "Time",
        size: 100,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {formatTime(cell.getValue())}
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
        accessorKey: "actions",
        header: "Actions",
        size: 120,
        Cell: ({ cell }) => {
          const rowStatus = cell.row.original.status;
          const isDeleted = rowStatus === "Deleted";

          if (isDeleted) {
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
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  onClick={() => handleOpenModal(cell.row.original)}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "6px",
                    color: theme === "light" ? "#6366f1" : "#818cf8",
                    backgroundColor:
                      theme === "light"
                        ? "rgba(99, 102, 241, 0.12)"
                        : "rgba(129, 140, 248, 0.15)",
                    "&:hover": {
                      backgroundColor:
                        theme === "light"
                          ? "rgba(99, 102, 241, 0.2)"
                          : "rgba(129, 140, 248, 0.25)",
                    },
                  }}
                >
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>

              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  onClick={() =>
                    handleDeleteClick(
                      cell.row.original.id,
                      cell.row.original.title,
                    )
                  }
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "6px",
                    color: theme === "light" ? "#dc2626" : "#f87171",
                    backgroundColor:
                      theme === "light"
                        ? "rgba(239, 68, 68, 0.12)"
                        : "rgba(248, 113, 113, 0.15)",
                    "&:hover": {
                      backgroundColor:
                        theme === "light"
                          ? "rgba(239, 68, 68, 0.2)"
                          : "rgba(248, 113, 113, 0.25)",
                    },
                  }}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        },
      },
      {
        accessorKey: "details",
        header: "Details",
        size: 100,
        Cell: ({ cell }) => {
          return (
            <Tooltip title="View Details">
              <IconButton
                onClick={(e) => handleDetailsClick(e, cell.row.original)}
                size="small"
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "6px",
                  color: theme === "light" ? "#6366f1" : "#818cf8",
                  backgroundColor:
                    theme === "light"
                      ? "rgba(99, 102, 241, 0.12)"
                      : "rgba(129, 140, 248, 0.15)",
                  "&:hover": {
                    backgroundColor:
                      theme === "light"
                        ? "rgba(99, 102, 241, 0.2)"
                        : "rgba(129, 140, 248, 0.25)",
                  },
                }}
              >
                <InfoIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          );
        },
      },
    ],

    [handleOpenModal, handleDeleteClick, handleDetailsClick, theme],
  );

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
    state: {
      ...tableConfig.table.state,
      isLoading: loading,
    },
    renderTopToolbarCustomActions: () => (
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FilterList
            sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
          />
          <Typography variant="body2" fontSize="0.8rem" color="text.secondary">
            Filter by status:
          </Typography>
        </Box>
        <Box sx={{ minWidth: 120 }}>
          <Dropdown
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.value)}
            appendTo={() => document.querySelector("#root .App") as HTMLElement}
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
        <Typography variant="caption" fontSize="0.75rem" color="text.secondary">
          Total: {totalCount} activities
        </Typography>
      </Box>
    ),
  });

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <MaterialReactTable table={table} />

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
                sx={{
                  color: "text.secondary",
                  "&:hover": {
                    backgroundColor: "action.hover",
                  },
                }}
              >
                <CloseIcon fontSize="small" />
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

export default React.memo(ViewHrActivities);
