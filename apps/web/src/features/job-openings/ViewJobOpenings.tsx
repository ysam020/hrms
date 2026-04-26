import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
} from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import { useNavigate } from "react-router-dom";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import EditJobOpeningModal from "./EditJobOpeningModal";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import Skeleton from "@mui/material/Skeleton";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import { Dropdown } from "primereact/dropdown";
import Box from "@mui/material/Box";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import FilterList from "@mui/icons-material/FilterList";
import InfoIcon from "@mui/icons-material/Info";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonIcon from "@mui/icons-material/Person";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import dayjs from "dayjs";
import { API_ENDPOINTS } from "@web/shared/constants";

function ViewJobOpenings({ refreshKey = 0 }) {
  const [data, setData] = useState<any[]>([]);
  const navigate = useNavigate();
  const [openModal, setOpenModal] = useState(false);
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const [jobData, setJobData] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("Active");
  const [loading, setLoading] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    id: string | null;
  }>({ open: false, id: null });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [detailsAnchorEl, setDetailsAnchorEl] = useState<HTMLElement | null>(
    null,
  );
  const [selectedJob, setSelectedJob] = useState<any>(null);

  const handleOpenModal = (e, data) => {
    e.stopPropagation();
    setJobData(data);
    setOpenModal(true);
  };
  const handleCloseModal = () => setOpenModal(false);

  const handleDetailsClick = (event, job) => {
    event.stopPropagation();
    setDetailsAnchorEl(event.currentTarget);
    setSelectedJob(job);
  };

  const handleDetailsClose = () => {
    setDetailsAnchorEl(null);
    setSelectedJob(null);
  };

  const isDetailsPopoverOpen = Boolean(detailsAnchorEl);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "N/A";
    return dayjs(timestamp).format("MMM DD, YYYY • hh:mm A");
  };

  const getData = useCallback(async () => {
    setLoading(true);
    setData([]);
    try {
      let url = API_ENDPOINTS.VIEW_JOB_OPENINGS;
      if (statusFilter && statusFilter !== "All") {
        url += `?status=${encodeURIComponent(statusFilter)}`;
      }
      const res = await apiClient(url);
      setData(res.data.data);
    } catch (error) {
      if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError")
        return;
      setAlert({
        open: true,
        message: error.response?.data?.message || "Failed to load job openings",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, setAlert]);

  useEffect(() => {
    getData();
  }, [getData, statusFilter, refreshKey]);

  const memoizedData = useMemo(() => data, [data]);

  const handleDeleteClick = (e, _id) => {
    e.stopPropagation();
    setDeleteDialog({ open: true, id: _id });
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_JOB_OPENING(deleteDialog.id!),
      );
      setDeleteDialog({ open: false, id: null });
      getData();
      setAlert({
        open: true,
        message: "Job opening deleted successfully",
        severity: "success",
      });
    } catch (err) {
      setAlert({
        open: true,
        message:
          err.message === "Network Error"
            ? "Network Error. Please check your connection and try again."
            : err.response?.data?.message || "Something went wrong",
        severity: "error",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, id: null });
  };

  const updateJobOptimistically = useCallback((jobId, updatedJobData) => {
    setData((prevData) =>
      prevData.map((job) =>
        job.id === jobId ? { ...job, ...updatedJobData } : job,
      ),
    );
  }, []);

  const revertOptimisticUpdate = useCallback(() => {
    getData();
  }, [getData]);

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
        accessorKey: "jobTitle",
        header: "Job Title",
        size: 220,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "applicationDeadline",
        header: "Deadline",
        size: 130,
        Cell: ({ cell }) => {
          const date = new Date(
            cell.row.original.applicationDeadline,
          ).toLocaleDateString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          return date === "Invalid Date" ? (
            <Skeleton width="50%" />
          ) : (
            <Typography variant="body2" fontSize="0.8rem">
              {date}
            </Typography>
          );
        },
      },
      {
        accessorKey: "numberOfVacancies",
        header: "Vacancies",
        size: 140,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "candidatesHired",
        header: "Hired",
        size: 120,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "budget",
        header: "Budget",
        size: 140,
        Cell: ({ cell }) => {
          const budget = cell.row.original.budget;
          return (
            <Typography variant="body2" fontSize="0.8rem">
              {!budget[0] ? (
                <Skeleton width="30%" component="span" />
              ) : (
                `${budget[0]} LPA`
              )}
              {" - "}
              {!budget[1] ? (
                <Skeleton width="30%" component="span" />
              ) : (
                `${budget[1]} LPA`
              )}
            </Typography>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        Cell: ({ cell }) => getStatusChip(cell.getValue()),
      },
      {
        accessorKey: "actions",
        header: "Actions",
        size: 120,
        Cell: ({ cell }) => {
          const isDeleted = cell.row.original.status === "Deleted";

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
                  onClick={(e) => handleOpenModal(e, cell.row.original)}
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
                  onClick={(e) => handleDeleteClick(e, cell.row.original.id)}
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
        size: 120,
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

  const { table: baseConfig } = useTableConfig(memoizedData, columns, loading);

  const table = useMaterialReactTable({
    ...baseConfig,
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
            options={[
              { label: "All", value: "All" },
              { label: "Active", value: "Active" },
              { label: "Expired", value: "Expired" },
              { label: "Deleted", value: "Deleted" },
            ]}
            placeholder="Select Status"
            className="w-full"
            style={{ minWidth: "120px" }}
            appendTo={() => document.querySelector("#root .App") as HTMLElement}
          />
        </Box>
      </Box>
    ),
    muiTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate(`/view-job-opening/${row.original.id}`),
      style: {
        cursor: "pointer",
        opacity: row.original.status === "Deleted" ? 0.6 : 1,
      },
    }),
  });

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <MaterialReactTable table={table} />

        <EditJobOpeningModal
          open={openModal}
          handleClose={handleCloseModal}
          jobData={jobData}
          getData={getData}
          updateJobOptimistically={updateJobOptimistically}
          revertOptimisticUpdate={revertOptimisticUpdate}
        />

        <ConfirmationDialog
          open={deleteDialog.open}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          title="Delete Job Opening"
          message="Are you sure you want to delete this job opening? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          loading={deleteLoading}
          variant="danger"
          theme={theme}
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
              minWidth: 400,
              maxWidth: 500,
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
            <Box sx={{ p: 2 }}>
              {selectedJob && (
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}
                >
                  <Box>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 1,
                      }}
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
                      {selectedJob.createdBy || "N/A"}
                    </Typography>
                  </Box>

                  <Box>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 1,
                      }}
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
                      {formatTimestamp(selectedJob.createdOn)}
                    </Typography>
                  </Box>

                  {selectedJob.status === "Deleted" && (
                    <>
                      <Divider />
                      <Box>
                        <Typography
                          variant="subtitle2"
                          color="error"
                          sx={{ mb: 1.5, fontWeight: 600, fontSize: "0.8rem" }}
                        >
                          Deletion Information
                        </Typography>
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            ml: 1,
                          }}
                        >
                          <Typography variant="body2" fontSize="0.8rem">
                            <strong>Deleted By:</strong>{" "}
                            {selectedJob.deletedBy || "N/A"}
                          </Typography>
                          <Typography variant="body2" fontSize="0.8rem">
                            <strong>Deleted On:</strong>{" "}
                            {formatTimestamp(selectedJob.deletedOn)}
                          </Typography>
                        </Box>
                      </Box>
                    </>
                  )}
                </Box>
              )}
            </Box>
          </Paper>
        </Popover>
      </ErrorBoundary>
    </div>
  );
}

export default React.memo(ViewJobOpenings);
