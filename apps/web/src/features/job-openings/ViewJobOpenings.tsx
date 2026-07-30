import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";
import EditJobOpeningModal from "./EditJobOpeningModal";
import NewJobOpening from "./NewJobOpening";
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
import Dialog from "@mui/material/Dialog";
import DialogTitleWithClose from "@web/shared/components/DialogTitleWithClose";
import DialogContent from "@mui/material/DialogContent";
import FilterList from "@mui/icons-material/FilterList";
import AddIcon from "@mui/icons-material/Add";
import InfoIcon from "@mui/icons-material/Info";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";
import PersonIcon from "@mui/icons-material/Person";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import dayjs from "dayjs";
import { API_ENDPOINTS } from "@web/shared/constants";
import { ignoreBackdropClick } from "@web/shared/utils/dialogClose";

function ViewJobOpenings() {
  const navigate = useNavigate();
  const [openModal, setOpenModal] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  // Superusers, owners, and admins always see edit/delete regardless of the
  // granular permission bit — mirrors requirePrivileged on the backend
  // routes these actions call.
  const isPrivilegedRole = isOwnerOrAdmin(user);
  const canCreate = hasPermission(
    "JobOpenings",
    "create_job_opening",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canEdit =
    isPrivilegedRole ||
    hasPermission(
      "JobOpenings",
      "edit_job_opening",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );
  const canDelete =
    isPrivilegedRole ||
    hasPermission(
      "JobOpenings",
      "delete_job_opening",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );
  const [jobData, setJobData] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("Active");
  const [globalFilter, setGlobalFilter] = useState("");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    id: string | null;
  }>({ open: false, id: null });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

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

  const careersUrl = user?.tenantSlug
    ? `${window.location.origin}/careers/${user.tenantSlug}`
    : null;

  const handleCopyCareersLink = () => {
    if (!careersUrl) return;
    navigator.clipboard.writeText(careersUrl);
    setAlert({
      open: true,
      message: "Careers link copied",
      severity: "success",
    });
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "N/A";
    return dayjs(timestamp).format("MMM DD, YYYY • hh:mm A");
  };

  const fetchJobOpenings = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        let params = "";
        if (statusFilter && statusFilter !== "All") {
          params += `&status=${encodeURIComponent(statusFilter)}`;
        }
        if (search) {
          params += `&search=${encodeURIComponent(search)}`;
        }
        const res = await apiClient(
          API_ENDPOINTS.VIEW_JOB_OPENINGS(page, limit, params),
        );
        return {
          data: res.data.data ?? [],
          totalCount: res.data.total ?? 0,
        };
      } catch (error) {
        if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError")
          throw error;
        setAlert({
          open: true,
          message:
            error.response?.data?.message || "Failed to load job openings",
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
    setData,
  } = useServerPagination(fetchJobOpenings, {
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

  const memoizedData = useMemo(() => data, [data]);

  useEffect(() => {
    setSelectedIds([]);
  }, [data]);

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
      refresh();
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

  const handleBulkDeleteConfirm = async () => {
    setBulkDeleteLoading(true);
    try {
      const res = await apiClient.put(API_ENDPOINTS.BULK_DELETE_JOB_OPENINGS, {
        ids: selectedIds,
      });
      const failed = res.data?.data?.failed ?? [];
      refresh();
      setAlert({
        open: true,
        message:
          failed.length > 0
            ? `${res.data.data.succeeded.length} deleted, ${failed.length} failed`
            : res.data.message || "Job openings deleted successfully",
        severity: failed.length > 0 ? "warning" : "success",
      });
      setSelectedIds([]);
      setBulkDeleteOpen(false);
    } catch (err) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Something went wrong",
        severity: "error",
      });
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const updateJobOptimistically = useCallback((jobId, updatedJobData) => {
    setData((prevData) =>
      prevData.map((job) =>
        job.id === jobId ? { ...job, ...updatedJobData } : job,
      ),
    );
  }, []);

  const revertOptimisticUpdate = useCallback(() => {
    refresh();
  }, [refresh]);

  const getStatusChip = (status) => {
    const deletedStyle = {
      color: theme === "light" ? "#dc2626" : "#f87171",
      bg:
        theme === "light"
          ? "rgba(239, 68, 68, 0.15)"
          : "rgba(248, 113, 113, 0.2)",
      label: "Deleted",
    };
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
      Deleted: deletedStyle,
      deleted: deletedStyle,
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
      { key: "jobTitle", label: "Job Title", primary: true, hideLabel: true },
      {
        key: "applicationDeadline",
        label: "Deadline",
        render: (row: any) => {
          const date = new Date(row.applicationDeadline).toLocaleDateString(
            "en-US",
            { year: "numeric", month: "2-digit", day: "2-digit" },
          );
          return date === "Invalid Date" ? <Skeleton width={60} /> : date;
        },
      },
      { key: "numberOfVacancies", label: "Vacancies" },
      { key: "candidatesHired", label: "Hired" },
      {
        key: "budget",
        label: "Budget",
        render: (row: any) => {
          const budget = row.budget;
          return `${budget[0] ? `${budget[0]} LPA` : "—"} - ${budget[1] ? `${budget[1]} LPA` : "—"}`;
        },
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

  const handleCopyApplyLink = (row: any, e?: any) => {
    e?.stopPropagation();
    if (!user?.tenantSlug) return;
    const link = `${window.location.origin}/careers/${user.tenantSlug}/apply/${row.id}`;
    navigator.clipboard.writeText(link);
    setAlert({
      open: true,
      message: `Apply link for "${row.jobTitle}" copied`,
      severity: "success",
    });
  };

  const rowActions = useCallback(
    (row: any) => {
      const isDeleted = row.status === "Deleted" || row.status === "deleted";
      if (isDeleted) return [];
      const actions: any[] = [];
      if (user?.tenantSlug) {
        actions.push({
          icon: <ContentCopyIcon sx={{ fontSize: 16 }} />,
          label: `Copy apply link: ${row.jobTitle ?? ""}`,
          onClick: (r: any, e: any) => handleCopyApplyLink(r, e),
        });
      }
      if (canEdit) {
        actions.push({
          icon: <EditIcon sx={{ fontSize: 16 }} />,
          label: `Edit job opening: ${row.jobTitle ?? ""}`,
          color: "primary" as const,
          onClick: (r: any, e: any) => handleOpenModal(e, r),
        });
      }
      if (canDelete) {
        actions.push({
          icon: <DeleteIcon sx={{ fontSize: 16 }} />,
          label: `Delete job opening: ${row.jobTitle ?? ""}`,
          color: "error" as const,
          onClick: (r: any, e: any) => handleDeleteClick(e, r.id),
        });
      }
      actions.push({
        icon: <InfoIcon sx={{ fontSize: 16 }} />,
        label: "View job opening details",
        onClick: (r: any, e: any) => handleDetailsClick(e, r),
      });
      return actions;
    },
    [canEdit, canDelete, user?.tenantSlug],
  );

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        {careersUrl && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 2,
              p: 1.5,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "action.hover",
            }}
          >
            <Typography variant="body2" color="text.secondary" noWrap>
              Public careers page:
            </Typography>
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
              noWrap
            >
              {careersUrl}
            </Typography>
            <Tooltip title="Copy link">
              <IconButton size="small" onClick={handleCopyCareersLink}>
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
        <DataList
          ariaLabel="Job openings"
          data={memoizedData}
          columns={columns}
          getRowId={(row: any) => row.id}
          actions={rowActions}
          loading={loading}
          emptyMessage="No job openings found"
          onRowClick={(row: any) => navigate(`/view-job-opening/${row.id}`)}
          search={{
            value: globalFilter,
            onChange: handleGlobalFilterChange,
            placeholder: "Search job openings…",
          }}
          selection={
            canDelete
              ? {
                  selectedIds,
                  onChange: setSelectedIds,
                  isRowSelectable: (row: any) =>
                    row.status !== "Deleted" && row.status !== "deleted",
                }
              : undefined
          }
          toolbarActions={
            selectedIds.length > 0 ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {selectedIds.length} selected
                </Typography>
                <IconButton
                  onClick={() => setBulkDeleteOpen(true)}
                  color="error"
                  size="small"
                  aria-label="Delete selected job openings"
                >
                  <DeleteIcon sx={{ fontSize: 18 }} />
                </IconButton>
                <Tooltip title="Clear selection">
                  <IconButton
                    onClick={() => setSelectedIds([])}
                    size="small"
                    aria-label="Clear selection"
                  >
                    <CloseIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <FilterList
                  sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
                />
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
                    appendTo={() =>
                      document.querySelector("#root .App") as HTMLElement
                    }
                  />
                </Box>
                {canCreate && (
                  <Tooltip title="New Job Opening">
                    <IconButton
                      onClick={() => setOpenAdd(true)}
                      color="primary"
                      size="small"
                      aria-label="New job opening"
                    >
                      <AddIcon sx={{ fontSize: 20 }} aria-hidden="true" />
                    </IconButton>
                  </Tooltip>
                )}
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
            pageSizeOptions: [10, 25, 50, 100],
          }}
        />

        <EditJobOpeningModal
          open={openModal}
          handleClose={handleCloseModal}
          jobData={jobData}
          getData={refresh}
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
        <ConfirmationDialog
          open={bulkDeleteOpen}
          onClose={() => !bulkDeleteLoading && setBulkDeleteOpen(false)}
          onConfirm={handleBulkDeleteConfirm}
          title="Delete Job Openings"
          message={`Are you sure you want to delete ${selectedIds.length} selected job opening(s)? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          loading={bulkDeleteLoading}
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

        <Dialog
          open={openAdd}
          onClose={ignoreBackdropClick(() => setOpenAdd(false))}
          disablePortal
          fullWidth
          maxWidth="md"
        >
          <DialogTitleWithClose onClose={() => setOpenAdd(false)}>
            New Job Opening
          </DialogTitleWithClose>
          <DialogContent>
            <NewJobOpening
              onSaved={() => {
                setOpenAdd(false);
                refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </ErrorBoundary>
    </div>
  );
}

export default memo(ViewJobOpenings);
