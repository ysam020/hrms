import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Add from "@mui/icons-material/Add";
import Save from "@mui/icons-material/Save";
import Cancel from "@mui/icons-material/Cancel";
import InfoIcon from "@mui/icons-material/Info";
import DeleteIcon from "@mui/icons-material/Delete";
import DataList from "@web/shared/components/DataList";
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
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

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
    setSelectedDates([]);
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

  const handleBulkDeleteConfirm = async () => {
    setBulkDeleteLoading(true);
    try {
      const res = await apiClient.put(API_ENDPOINTS.BULK_DELETE_HOLIDAYS, {
        dates: selectedDates,
      });
      getHolidays();
      setAlert({
        open: true,
        message: res.data.message || "Holidays deleted successfully",
        severity: "success",
      });
      setSelectedDates([]);
      setBulkDeleteOpen(false);
    } catch (err) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Failed to delete holidays",
        severity: "error",
      });
    } finally {
      setBulkDeleteLoading(false);
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
        key: "name",
        label: "Holiday Name",
        primary: true,
        hideLabel: true,
        render: (row: any) => {
          if (row.isAddRow) {
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
            <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
              {row.name}
            </Typography>
          );
        },
      },
      {
        key: "date",
        label: "Date",
        render: (row: any) => {
          if (row.isAddRow) {
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
          return row.date;
        },
      },
    ],
    [formik],
  );

  const rowActions = useCallback(
    (row: any) => {
      if (row.isAddRow) {
        return [
          {
            icon: <Save sx={{ fontSize: 16 }} />,
            label: "Save holiday",
            color: "success" as const,
            onClick: () => formik.handleSubmit(),
          },
          {
            icon: <Cancel sx={{ fontSize: 16 }} />,
            label: "Cancel adding holiday",
            onClick: () => handleCancelAdd(),
          },
        ];
      }
      const actions: any[] = [
        {
          icon: <InfoIcon sx={{ fontSize: 16 }} />,
          label: "View holiday details",
          color: "primary" as const,
          onClick: (r: any, e: any) => handleDetailsClick(e, r),
        },
      ];
      if (canDelete) {
        actions.push({
          icon: <DeleteIcon sx={{ fontSize: 16 }} />,
          label: `Delete holiday ${row.name}`,
          color: "error" as const,
          onClick: () => handleDeleteClick(row.date, row.name),
        });
      }
      return actions;
    },
    [formik, canDelete, handleDeleteClick, handleDetailsClick],
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

  return (
    <Box sx={{ p: 2 }}>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <DataList
          ariaLabel="Holidays"
          data={tableData}
          columns={columns}
          getRowId={(row: any) => row.date}
          actions={rowActions}
          loading={formik.isSubmitting}
          emptyMessage="No holidays configured"
          selection={
            canDelete
              ? {
                  selectedIds: selectedDates,
                  onChange: setSelectedDates,
                  isRowSelectable: (row: any) => !row.isAddRow,
                }
              : undefined
          }
          toolbarActions={
            selectedDates.length > 0 ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {selectedDates.length} selected
                </Typography>
                <IconButton
                  onClick={() => setBulkDeleteOpen(true)}
                  color="error"
                  size="small"
                  aria-label="Delete selected holidays"
                >
                  <DeleteIcon sx={{ fontSize: 18 }} />
                </IconButton>
                <Tooltip title="Clear selection">
                  <IconButton
                    onClick={() => setSelectedDates([])}
                    size="small"
                    aria-label="Clear selection"
                  >
                    <Cancel sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Calendar
                  value={date}
                  onChange={(e) => e.value && setDate(e.value)}
                  view="year"
                  dateFormat="yy"
                  showIcon
                  placeholder="Select Year"
                  style={{ maxWidth: 180 }}
                />
                {canAdd && (
                  <Tooltip title="Add Holiday">
                    <span>
                      <IconButton
                        onClick={handleAddClick}
                        disabled={isAdding}
                        color="primary"
                        size="small"
                        aria-label="Add holiday"
                      >
                        <Add aria-hidden="true" sx={{ fontSize: 20 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
            )
          }
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
        <ConfirmationDialog
          open={bulkDeleteOpen}
          onClose={() => !bulkDeleteLoading && setBulkDeleteOpen(false)}
          onConfirm={handleBulkDeleteConfirm}
          title="Delete Holidays"
          message={`Are you sure you want to delete ${selectedDates.length} selected holiday(s)?`}
          description="This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          loading={bulkDeleteLoading}
          variant="danger"
          theme={theme}
        />
      </ErrorBoundary>
    </Box>
  );
}

export default memo(ViewAddHolidays);
