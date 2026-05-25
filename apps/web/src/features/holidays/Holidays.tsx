import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Add from "@mui/icons-material/Add";
import Save from "@mui/icons-material/Save";
import Cancel from "@mui/icons-material/Cancel";
import InfoIcon from "@mui/icons-material/Info";
import DeleteIcon from "@mui/icons-material/Delete";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { Calendar } from "primereact/calendar";
import { InputText } from "primereact/inputtext";
import { useFormik } from "formik";
import Popover from "@mui/material/Popover";
import Paper from "@mui/material/Paper";
import PersonIcon from "@mui/icons-material/Person";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { z } from "zod";
import { toFormikValidationSchema } from "zod-formik-adapter";
import dayjs from "dayjs";
import { API_ENDPOINTS } from "@web/shared/constants";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";

const validationSchema = toFormikValidationSchema(
  z.object({
    name: z.string().min(1, "Name is required"),
    date: z.date({
      required_error: "Date is required",
      invalid_type_error: "Invalid date",
    }),
  }),
);

function ViewAddHolidays() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const canAdd = hasPermission(
    "Holidays",
    "add",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canDelete = hasPermission(
    "Holidays",
    "delete",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const [isAdding, setIsAdding] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [date, setDate] = useState(() => {
    const currentYear = new Date().getFullYear();
    return new Date(`${currentYear}-01-01`);
  });

  const [detailsAnchorEl, setDetailsAnchorEl] = useState<HTMLElement | null>(
    null,
  );
  const [selectedHoliday, setSelectedHoliday] = useState<any>(null);
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    date: null,
    name: "",
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const formik = useFormik({
    initialValues: { name: "", date: "" },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const formattedValues = {
          ...values,
          date: dayjs(values.date).format("YYYY-MM-DD"),
        };

        await apiClient.post(API_ENDPOINTS.ADD_HOLIDAY, formattedValues);
        getHolidays();
        formik.resetForm();
        setIsAdding(false);
        setAlert({
          open: true,
          message: "Holiday added successfully",
          severity: "success",
        });
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response?.data?.message || "Something went wrong",
          severity: "error",
        });
      }
    },
  });

  useEffect(() => {
    getHolidays();
  }, [date]);

  const isDetailsPopoverOpen = Boolean(detailsAnchorEl);

  const handleDetailsClick = (event, holiday) => {
    setDetailsAnchorEl(event.currentTarget);
    setSelectedHoliday(holiday);
  };

  const handleDetailsClose = () => {
    setDetailsAnchorEl(null);
    setSelectedHoliday(null);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "N/A";
    return dayjs(timestamp).format("MMM DD, YYYY • hh:mm A");
  };

  const handleDeleteClick = (date, name) => {
    setDeleteDialog({ open: true, date, name });
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, date: null, name: "" });
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      await apiClient.put(API_ENDPOINTS.DELETE_HOLIDAY, {
        date: deleteDialog.date,
      });
      getHolidays();
      setAlert({
        open: true,
        message: "Holiday deleted successfully",
        severity: "success",
      });
      setDeleteDialog({ open: false, date: null, name: "" });
    } catch (err) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Failed to delete holiday",
        severity: "error",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAddClick = () => {
    setIsAdding(true);
    formik.resetForm();
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    formik.resetForm();
  };

  const getHolidays = useCallback(async () => {
    try {
      const selectedYear = date.getFullYear();
      const res = await apiClient(API_ENDPOINTS.GET_HOLIDAYS(selectedYear));
      setData(res.data.data);
    } catch (error) {
      if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError")
        return;
      setAlert({
        open: true,
        message: "Failed to fetch holidays. Please try again.",
        severity: "error",
      });
    }
  }, [date]);

  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Holiday Name",
        size: 400,
        Cell: ({ cell, row }) => {
          if (row.original.isAddRow) {
            return (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  width: "100%",
                }}
              >
                <InputText
                  value={formik.values.name}
                  onChange={(e) => formik.setFieldValue("name", e.target.value)}
                  onBlur={() => formik.setFieldTouched("name", true)}
                  placeholder="Enter holiday name"
                  className={
                    formik.touched.name && formik.errors.name ? "p-invalid" : ""
                  }
                />
                {formik.touched.name && formik.errors.name && (
                  <small className="p-error">{formik.errors.name}</small>
                )}
              </Box>
            );
          }
          return (
            <Typography variant="body2" fontSize="0.8rem">
              {cell.getValue()}
            </Typography>
          );
        },
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 300,
        Cell: ({ cell, row }) => {
          if (row.original.isAddRow) {
            return (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Calendar
                  value={
                    formik.values.date ? new Date(formik.values.date) : null
                  }
                  onChange={(e) => formik.setFieldValue("date", e.value)}
                  onBlur={() => formik.setFieldTouched("date", true)}
                  dateFormat="yy-mm-dd"
                  placeholder="Select date"
                  showIcon
                  className={
                    formik.touched.date && formik.errors.date ? "p-invalid" : ""
                  }
                  style={{ width: "100%" }}
                />
                {formik.touched.date && formik.errors.date && (
                  <small className="p-error">{formik.errors.date}</small>
                )}
              </Box>
            );
          }
          return (
            <Typography variant="body2" fontSize="0.8rem">
              {cell.getValue()}
            </Typography>
          );
        },
      },
      {
        accessorKey: "actions",
        header: "Actions",
        size: 200,
        Cell: ({ row }) => {
          const rowData = row.original;

          if (rowData.isAddRow) {
            return (
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Tooltip title="Save Holiday">
                  <IconButton
                    size="small"
                    onClick={() => formik.handleSubmit()}
                    disabled={formik.isSubmitting}
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
                    <Save sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Cancel">
                  <IconButton
                    size="small"
                    onClick={handleCancelAdd}
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
                    <Cancel sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            );
          }

          if (!canDelete) return null;

          return (
            <Tooltip title="Delete Holiday">
              <IconButton
                size="small"
                onClick={() => handleDeleteClick(rowData.date, rowData.name)}
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
          );
        },
      },
      {
        accessorKey: "details",
        header: "Details",
        size: 200,
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

    [
      formik,
      isAdding,
      handleDeleteClick,
      handleDetailsClick,
      theme,
      canAdd,
      canDelete,
    ],
  );

  const tableData = useMemo(() => {
    const holidayData = [...(data || [])];

    if (isAdding) {
      holidayData.push({
        name: "",
        date: "",
        isAddRow: true,
        id: "add-row",
      });
    }

    return holidayData;
  }, [data, isAdding]);

  const { table: tableConfig } = useTableConfig(tableData, columns, false);

  const table = useMaterialReactTable({
    ...tableConfig,
    renderTopToolbarCustomActions: () => (
      <div style={{ width: "100%", display: "flex", alignItems: "center" }}>
        <Calendar
          value={date}
          onChange={(e) => e.value && setDate(e.value)}
          view="year"
          dateFormat="yy"
          showIcon
          placeholder="Select Year"
          style={{ maxWidth: 300 }}
        />
        <div style={{ flex: 1 }}></div>
        {canAdd && (
          <Tooltip title="Add Holiday">
            <span>
              <IconButton
                onClick={handleAddClick}
                disabled={isAdding}
                color="primary"
                size="small"
              >
                <Add sx={{ fontSize: 20 }} />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </div>
    ),
    state: {
      isLoading: formik.isSubmitting,
    },
  });

  return (
    <Box sx={{ p: 2 }}>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <MaterialReactTable table={table} />

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
              {/* Created Information */}
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
                  {selectedHoliday?.createdBy || "N/A"}
                </Typography>
              </Box>

              {/* Created Date */}
              <Box>
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
                  {formatTimestamp(selectedHoliday?.createdOn)}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Popover>
        <ConfirmationDialog
          open={deleteDialog.open}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          title="Delete Holiday"
          message={`Are you sure you want to delete "${deleteDialog.name}"?`}
          description="This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          loading={deleteLoading}
          variant="danger"
          theme={theme}
        />
      </ErrorBoundary>
    </Box>
  );
}

export default memo(ViewAddHolidays);
