import React, { useState, useMemo, useContext, useCallback } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import ViewFeedbackModal from "./ViewFeedbackModal";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Person from "@mui/icons-material/Person";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import { API_ENDPOINTS } from "@web/shared/constants";

function ViewResignations() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const [resignationData, setResignationData] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [statusFilter] = useState("All");

  const handleOpenModal = useCallback((data) => {
    setResignationData(data);
    setOpenModal(true);
  }, []);
  const handleCloseModal = useCallback(() => setOpenModal(false), []);

  const fetchResignations = useCallback(
    async ({ page, limit }) => {
      try {
        let url = API_ENDPOINTS.VIEW_RESIGNATIONS(page, limit);
        if (statusFilter && statusFilter !== "All") {
          url += `&status=${encodeURIComponent(statusFilter)}`;
        }

        const response = await apiClient(url);

        return {
          data: response.data.data || [],
          totalCount: response.data.totalCount || 0,
        };
      } catch (error) {
        setAlert({
          open: true,
          message: "Failed to fetch resignations",
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
  } = useServerPagination(fetchResignations, {
    initialPageSize: 10,
    deps: [statusFilter],
  });

  const handleResignationAction = useCallback(
    async ({ id, action, successMessage }) => {
      try {
        const res = await apiClient.put(`/${action}/${id}`);
        refresh();
        setAlert({
          open: true,
          message: res.data.message || successMessage,
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response?.data?.message || "Something went wrong",
          severity: "error",
        });
      }
    },
    [refresh, setAlert],
  );

  const handleCheckboxChange = useCallback(
    async ({ id, status, value }) => {
      try {
        const res = await apiClient.put(API_ENDPOINTS.UPDATE_RESIGNATION(id), {
          status,
          value,
        });
        refresh();
        setAlert({
          open: true,
          message: res.data.message || `${status} updated`,
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your changes will be saved once back online"
              : err.response?.data?.message || "Update failed",
          severity: "error",
        });
      }
    },
    [refresh, setAlert],
  );

  const getStatusChip = useCallback(
    (status) => {
      const statusMap = {
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
        Submitted: {
          color: theme === "light" ? "#d97706" : "#fbbf24",
          bg:
            theme === "light"
              ? "rgba(251, 191, 36, 0.15)"
              : "rgba(251, 191, 36, 0.2)",
          label: "Submitted",
        },
        Withdrawn: {
          color: theme === "light" ? "#64748b" : "#94a3b8",
          bg:
            theme === "light"
              ? "rgba(100, 116, 139, 0.15)"
              : "rgba(148, 163, 184, 0.2)",
          label: "Withdrawn",
        },
      };

      const config = statusMap[status] || statusMap.Submitted;

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
    },
    [theme],
  );

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
            <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
              {cell.getValue()}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "resignationDate",
        header: "Resignation Date",
        size: 140,
        Cell: ({ cell }) => {
          const dateValue = cell.row.original?.resignationDate;
          let displayDate = "N/A";
          if (typeof dateValue === "string") {
            displayDate = dateValue.split("-").reverse().join("-");
          } else if (dateValue instanceof Date) {
            displayDate = dateValue.toLocaleDateString("en-GB");
          }
          return (
            <Typography variant="body2" fontSize="0.8rem">
              {displayDate}
            </Typography>
          );
        },
      },
      {
        accessorKey: "lastDate",
        header: "Last Date",
        size: 120,
        Cell: ({ cell }) => {
          const dateValue = cell.row.original?.lastDate;
          let displayDate = "N/A";
          if (typeof dateValue === "string") {
            displayDate = dateValue.split("-").reverse().join("-");
          } else if (dateValue instanceof Date) {
            displayDate = dateValue.toLocaleDateString("en-GB");
          }
          return (
            <Typography variant="body2" fontSize="0.8rem">
              {displayDate}
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
        accessorKey: "action",
        header: "Actions",
        size: 200,
        Cell: ({ cell }) => {
          const rowData = cell.row.original;
          const canApproveReject =
            !["Withdrawn", "Rejected", "Approved"].includes(rowData.status) &&
            (user?.isSuperUser || rowData.username !== user.username);
          const canWithdraw =
            !["Withdrawn"].includes(rowData.status) &&
            (rowData.username === user.username || user?.isSuperUser);

          return (
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              <Tooltip title="View Feedback">
                <IconButton
                  size="small"
                  onClick={() => handleOpenModal(rowData)}
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
                  <VisibilityIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>

              {canApproveReject && (
                <>
                  <Tooltip title="Approve">
                    <IconButton
                      size="small"
                      onClick={() =>
                        handleResignationAction({
                          id: rowData.id,
                          action: "approve-resignation",
                          successMessage: "Resignation approved successfully",
                        })
                      }
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: "6px",
                        color: theme === "light" ? "#059669" : "#34d399",
                        backgroundColor:
                          theme === "light"
                            ? "rgba(16, 185, 129, 0.12)"
                            : "rgba(52, 211, 153, 0.15)",
                        "&:hover": {
                          backgroundColor:
                            theme === "light"
                              ? "rgba(16, 185, 129, 0.2)"
                              : "rgba(52, 211, 153, 0.25)",
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
                        handleResignationAction({
                          id: rowData.id,
                          action: "reject-resignation",
                          successMessage: "Resignation rejected successfully",
                        })
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
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </>
              )}

              {canWithdraw && (
                <Tooltip title="Withdraw">
                  <IconButton
                    size="small"
                    onClick={() =>
                      handleResignationAction({
                        id: rowData.id,
                        action: "withdraw-resignation",
                        successMessage: "Resignation withdrawn successfully",
                      })
                    }
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: "6px",
                      color: theme === "light" ? "#64748b" : "#94a3b8",
                      backgroundColor:
                        theme === "light"
                          ? "rgba(100, 116, 139, 0.12)"
                          : "rgba(148, 163, 184, 0.15)",
                      "&:hover": {
                        backgroundColor:
                          theme === "light"
                            ? "rgba(100, 116, 139, 0.2)"
                            : "rgba(148, 163, 184, 0.25)",
                      },
                    }}
                  >
                    <RemoveCircleOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        },
      },
      {
        accessorKey: "assetsReturned",
        header: "Assets Returned",
        size: 200,
        Cell: ({ cell }) => {
          const rowData = cell.row.original;
          const canEdit =
            (user?.isSuperUser || rowData.username !== user.username) &&
            rowData.status !== "Withdrawn" &&
            rowData.status !== "Rejected";

          if (!canEdit) {
            return (
              <Typography
                variant="body2"
                fontSize="0.7rem"
                color="text.disabled"
              >
                —
              </Typography>
            );
          }

          return (
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <Checkbox
                checked={rowData.assetsReturned}
                onChange={(e) =>
                  handleCheckboxChange({
                    id: rowData.id,
                    status: "Assets Returned",
                    value: e.target.checked,
                  })
                }
                size="small"
                sx={{
                  "& .MuiSvgIcon-root": { fontSize: 18 },
                }}
              />
            </Box>
          );
        },
      },
      {
        accessorKey: "fnfDone",
        header: "FnF Done",
        size: 200,
        Cell: ({ cell }) => {
          const rowData = cell.row.original;
          const canEdit =
            (user?.isSuperUser || rowData.username !== user.username) &&
            rowData.status !== "Withdrawn" &&
            rowData.status !== "Rejected";

          if (!canEdit) {
            return (
              <Typography
                variant="body2"
                fontSize="0.7rem"
                color="text.disabled"
              >
                —
              </Typography>
            );
          }

          return (
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <Checkbox
                checked={rowData.fnfDone}
                onChange={(e) =>
                  handleCheckboxChange({
                    id: rowData.id,
                    status: "FnF Done",
                    value: e.target.checked,
                  })
                }
                size="small"
                sx={{
                  "& .MuiSvgIcon-root": { fontSize: 18 },
                }}
              />
            </Box>
          );
        },
      },
    ],
    [
      user,
      handleOpenModal,
      handleResignationAction,
      handleCheckboxChange,
      getStatusChip,
      theme,
    ],
  );

  const memoizedData = useMemo(() => data || [], [data]);

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
  });

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <MaterialReactTable table={table} />

      <ViewFeedbackModal
        open={openModal}
        handleClose={handleCloseModal}
        resignationData={resignationData}
      />
    </ErrorBoundary>
  );
}

export default React.memo(ViewResignations);
