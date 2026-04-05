import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import EventIcon from "@mui/icons-material/Event";
import EditIcon from "@mui/icons-material/Edit";
import Button from "@web/shared/components/Button";
import CustomModal from "@web/shared/components/Modal";
import { useFormik } from "formik";
import { validationSchema } from "../schemas";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import Grid from "@mui/material/Grid2";
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import "dayjs/locale/en-gb";
import { Calendar } from "primereact/calendar";
import { API_ENDPOINTS } from "@web/shared/constants";
import { style } from "@web/shared/utils/modalStyle";
// Extend dayjs with required plugins
dayjs.extend(isSameOrBefore);

function AddEventModal({
  open,
  handleClose,
  getEvents,
  selectedSlot,
  editEventData = null as any,
  isEditMode = false,
}) {
  const { setAlert } = React.useContext(AlertContext);

  const getInitialValues = React.useCallback(() => {
    const baseValues = {
      title: "",
      date: "",
      startTime: "",
      endTime: "",
      description: "",
    };

    // If editing an existing event
    if (isEditMode && editEventData) {
      return {
        title: editEventData.title || "",
        date: editEventData.date || "",
        startTime: editEventData.startTime || "",
        endTime: editEventData.endTime || "",
        description: editEventData.description || "",
      };
    }

    // If creating a new event with selected slot
    if (selectedSlot) {
      const slotDate = dayjs(selectedSlot.start).format("YYYY-MM-DD");

      if (selectedSlot.start && selectedSlot.end) {
        const startTime = dayjs(selectedSlot.start).format("HH:mm");
        const endTime = dayjs(selectedSlot.end).format("HH:mm");

        return {
          ...baseValues,
          date: slotDate,
          startTime: startTime !== "00:00" ? startTime : "",
          endTime: endTime !== "00:00" && endTime !== startTime ? endTime : "",
        };
      } else {
        return {
          ...baseValues,
          date: slotDate,
        };
      }
    }

    return baseValues;
  }, [selectedSlot, editEventData, isEditMode]);

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: getInitialValues(),
    validationSchema,
    onSubmit: async (values, { resetForm, setSubmitting }) => {
      try {
        // Validate end time is after start time if both are provided
        if (values.startTime && values.endTime) {
          const start = dayjs(`${values.date} ${values.startTime}`);
          const end = dayjs(`${values.date} ${values.endTime}`);

          if (end.isSameOrBefore(start)) {
            setAlert({
              open: true,
              message: "End time must be after start time",
              severity: "error",
            });
            setSubmitting(false);
            return;
          }
        }

        if (isEditMode && editEventData?._id) {
          await apiClient.put(
            API_ENDPOINTS.EDIT_CALENDAR_EVENT(editEventData._id),
            values,
          );

          setAlert({
            open: true,
            message: "Event updated successfully!",
            severity: "success",
          });
        } else {
          await apiClient.post(API_ENDPOINTS.ADD_EVENT, values);

          setAlert({
            open: true,
            message: "Event created successfully!",
            severity: "success",
          });
        }

        getEvents();

        resetForm();
        handleClose();
      } catch (error) {
        console.error("Error saving event:", error);

        setAlert({
          open: true,
          message:
            error.response?.data?.message ||
            (isEditMode ? "Failed to update event" : "Failed to create event"),
          severity: "error",
        });
      } finally {
        setSubmitting(false);
      }
    },
  });

  // Reset form when modal closes
  React.useEffect(() => {
    if (!open) {
      formik.resetForm();
    }
  }, [open]);

  const getModalInfo = () => {
    if (isEditMode) {
      return {
        title: "Edit Event",
        icon: <EditIcon sx={{ color: "#6C5DFC", fontSize: 24 }} />,
      };
    } else if (selectedSlot) {
      const startTime =
        formik.values.startTime ||
        (selectedSlot.start &&
        dayjs(selectedSlot.start).format("HH:mm") !== "00:00"
          ? dayjs(selectedSlot.start).format("HH:mm")
          : null);
      const endTime =
        formik.values.endTime ||
        (selectedSlot.end && dayjs(selectedSlot.end).format("HH:mm") !== "00:00"
          ? dayjs(selectedSlot.end).format("HH:mm")
          : null);

      if (startTime && endTime && startTime !== endTime) {
        return {
          title: "Add New Event",
          icon: <EventIcon sx={{ color: "#6C5DFC", fontSize: 24 }} />,
        };
      } else if (startTime) {
        return {
          title: "Add New Event",
          icon: <EventIcon sx={{ color: "#6C5DFC", fontSize: 24 }} />,
        };
      }

      return {
        title: "Add New Event",
        icon: <EventIcon sx={{ color: "#6C5DFC", fontSize: 24 }} />,
      };
    } else {
      return {
        title: "Add New Event",
        icon: <EventIcon sx={{ color: "#6C5DFC", fontSize: 24 }} />,
      };
    }
  };

  const modalInfo = getModalInfo();

  return (
    <CustomModal
      open={open}
      handleClose={handleClose}
      modalStyle={style}
      disableEscapeKeyDown={false}
      disablePortal
    >
      {/* Modal Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
          pb: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center" }}>
          {modalInfo.icon}
          <Typography
            id="event-modal-title"
            variant="h6"
            component="h2"
            sx={{ fontWeight: 600, color: "text.primary" }}
          >
            {modalInfo.title}
          </Typography>
        </Box>
      </Box>

      {/* Form */}
      <Box component="form" onSubmit={formik.handleSubmit}>
        <Grid container spacing={2}>
          <Grid size={12}>
            <FormikInputWrapper
              type="text"
              name="title"
              placeholder="Event Title"
              label="Title"
              formik={formik}
              required
              autoFocus
            />
          </Grid>

          <Grid size={12}>
            <Calendar
              value={
                formik.values.date
                  ? new Date(`${formik.values.date}T00:00:00`)
                  : null
              }
              onChange={(e) => {
                const selectedDate = e.value;

                if (selectedDate) {
                  const formattedDate =
                    dayjs(selectedDate).format("YYYY-MM-DD");
                  formik.setFieldValue("date", formattedDate);
                } else {
                  formik.setFieldValue("date", "");
                }
              }}
              onBlur={() => formik.setFieldTouched("date", true)}
              minDate={new Date()}
              dateFormat="dd/mm/yy"
              showIcon
              showButtonBar
              placeholder={"Event Date"}
              appendTo={"self"}
            />
          </Grid>

          <Grid size={6}>
            <Calendar
              value={
                formik.values.startTime
                  ? new Date(`1970-01-01T${formik.values.startTime}`)
                  : null
              }
              onChange={(e) => {
                const time = dayjs(e.value).format("HH:mm");
                formik.setFieldValue("startTime", time);
              }}
              onBlur={() => formik.setFieldTouched("startTime", true)}
              timeOnly
              showIcon
              hourFormat="12"
              placeholder={"Start Time"}
              appendTo={"self"}
              stepMinute={15}
            />
          </Grid>

          <Grid size={6}>
            <Calendar
              value={
                formik.values.endTime
                  ? new Date(`1970-01-01T${formik.values.endTime}`)
                  : null
              }
              onChange={(e) => {
                const time = dayjs(e.value).format("HH:mm");
                formik.setFieldValue("endTime", time);
              }}
              onBlur={() => formik.setFieldTouched("endTime", true)}
              timeOnly
              showIcon
              hourFormat="12"
              placeholder={"End Time"}
              appendTo={"self"}
              stepMinute={15}
            />
          </Grid>

          <Grid size={12}>
            <FormikInputWrapper
              type="text"
              name="description"
              placeholder="Event Description"
              label="Description"
              formik={formik}
              multiline
              rows={3}
            />
          </Grid>
        </Grid>

        {/* Action Buttons */}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            justifyContent: "flex-end",
            mt: 3,
            pt: 2,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button onClick={handleClose} disabled={formik.isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              !formik.isValid || !formik.values.title || !formik.values.date
            }
          >
            {isEditMode ? "Update Event" : "Create Event"}
          </Button>
        </Box>
      </Box>
    </CustomModal>
  );
}

export default React.memo(AddEventModal);
