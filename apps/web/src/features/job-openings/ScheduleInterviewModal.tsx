import React, { useContext, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Alert from "@mui/material/Alert";
import dayjs from "dayjs";
import { useFormik } from "formik";
import { z } from "zod";
import { toFormikValidationSchema } from "zod-formik-adapter";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import Button from "@web/shared/components/Button";
import CustomModal from "@web/shared/components/Modal";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import UserAutoComplete from "@web/shared/components/UserAutoComplete";
import { Calendar } from "primereact/calendar";
import useUserList from "@web/shared/hooks/useUserList";
import { API_ENDPOINTS } from "@web/shared/constants";

function ScheduleInterviewModal({
  open,
  handleClose,
  getJobApplications,
  applicantData,
  _id,
}) {
  const { setAlert } = useContext(AlertContext);
  const [mode, setMode] = useState("schedule");
  const { name, email, round } = applicantData || {};
  const userListRaw = useUserList();
  const userList = userListRaw.map((u) => u.label);

  const validationSchema = toFormikValidationSchema(
    z.object({
      username: z.string().min(1, "Please select an interviewer"),
      dateTime: z.date({
        required_error: "Please select date and time",
        invalid_type_error: "Please select date and time",
      }),
    }),
  );

  const formik = useFormik({
    initialValues: {
      username: "",
      dateTime: null,
    },
    validationSchema,
    onSubmit: async (values) => {
      const startDate = values.dateTime as unknown as Date;
      const endDate = new Date(startDate.getTime() + 1 * 60 * 60000); // 1 hour duration
      const formatDate = (date) => dayjs(date).format("YYYYMMDDTHHmmss");

      try {
        let res;
        if (mode === "schedule") {
          res = await apiClient.put(API_ENDPOINTS.SCHEDULE_INTERVIEW, {
            email,
            name,
            interviewer: values.username,
            interviewDateTime: startDate,
            interviewStartTime: formatDate(startDate),
            interviewEndTime: formatDate(endDate),
            roundNumber: round,
            _id: applicantData._id,
          });
        } else if (mode === "reschedule") {
          res = await apiClient.put(API_ENDPOINTS.RESCHEDULE_INTERVIEW, {
            email,
            name,
            interviewer: values.username,
            interviewDateTime: startDate,
            interviewStartTime: formatDate(startDate),
            interviewEndTime: formatDate(endDate),
            _id: applicantData._id,
          });
        } else {
          throw new Error("Invalid mode");
        }

        handleClose();
        getJobApplications && getJobApplications();
        formik.resetForm();
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response?.data?.message ||
                "Error submitting interview details",
          severity: "error",
        });
      }
    },
  });

  const modalStyle = {
    width: { xs: "90%", sm: 600 },
  };

  return (
    <CustomModal
      open={open}
      handleClose={handleClose}
      modalStyle={modalStyle}
      disablePortal
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
          pb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: mode === "reschedule" ? "warning.main" : "info.main",
              color: "white",
            }}
          >
            <ScheduleIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem" }}
            >
              {mode === "reschedule" ? "Reschedule" : "Schedule"} Interview
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Round {round || 1} Interview
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Candidate Information */}
      <Box sx={{ p: 1.5, pb: 0 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Candidate Information
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            icon={<PersonIcon />}
            label={name || "N/A"}
            variant="outlined"
            size="small"
          />
          <Chip
            icon={<EmailIcon />}
            label={email || "N/A"}
            variant="outlined"
            size="small"
          />
        </Stack>
      </Box>

      {/* Mode Toggle */}
      <Box sx={{ p: 1.5, pb: 0 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={mode === "reschedule"}
              onChange={(e) => {
                const newMode = e.target.checked ? "reschedule" : "schedule";
                setMode(newMode);
              }}
              sx={{
                color: "primary.main",
                "&.Mui-checked": {
                  color: "warning.main",
                },
              }}
            />
          }
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" fontWeight={500}>
                Reschedule existing interview
              </Typography>
              {mode === "reschedule" && (
                <Chip
                  label="Reschedule Mode"
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              )}
            </Box>
          }
        />

        {mode === "reschedule" && (
          <Alert severity="info" sx={{ mt: 1.5, borderRadius: 2 }}>
            <Typography variant="body2">
              You are rescheduling an existing interview. The candidate will be
              notified of the change.
            </Typography>
          </Alert>
        )}
      </Box>

      {/* Form */}
      <Box sx={{ p: 1.5 }}>
        <form onSubmit={formik.handleSubmit}>
          <Stack spacing={1}>
            {/* Interviewer Selection */}
            <Box>
              <Typography
                variant="h6"
                color="text.secondary"
                gutterBottom
                sx={{ mb: 1 }}
              >
                <PersonIcon
                  sx={{ fontSize: 16, mr: 0.5, verticalAlign: "middle" }}
                />
                Select Interviewer
              </Typography>
              <UserAutoComplete
                formik={formik}
                placeholder="Choose interviewer from the list"
                customUserList={userList}
              />
              {formik.touched.username && formik.errors.username && (
                <Typography
                  variant="caption"
                  color="error"
                  sx={{ mt: 0.5, display: "block" }}
                >
                  {formik.errors.username}
                </Typography>
              )}
            </Box>

            {/* Date and Time Selection */}
            <Box>
              <Typography
                variant="h6"
                color="text.secondary"
                gutterBottom
                sx={{ mb: 1 }}
              >
                <CalendarTodayIcon
                  sx={{ fontSize: 16, mr: 0.5, verticalAlign: "middle" }}
                />
                Interview Date & Time
              </Typography>
              <Calendar
                value={formik.values.dateTime}
                onChange={(e) => formik.setFieldValue("dateTime", e.value)}
                showTime
                hourFormat="24"
                dateFormat="dd/mm/yy"
                appendTo="self"
                minDate={new Date()}
                disabledDays={[0]} // Disable Sundays
                timeOnly={false}
                showButtonBar
                stepMinute={15}
                style={{ width: "100%" }}
                placeholder="Select interview date and time"
              />
              {formik.touched.dateTime && formik.errors.dateTime && (
                <Typography
                  variant="caption"
                  color="error"
                  sx={{ mt: 0.5, display: "block" }}
                >
                  {formik.errors.dateTime}
                </Typography>
              )}

              {/* Time Info */}
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  bgcolor: "action.hover",
                  borderRadius: 1,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                >
                  <AccessTimeIcon sx={{ fontSize: 14 }} />
                  Interview duration: 1 hour • Sundays are disabled • 15-minute
                  intervals
                </Typography>
              </Box>
            </Box>

            <Box sx={{ mt: 0 }}>
              <Button type="submit" disabled={formik.isSubmitting}>
                {mode === "reschedule" ? "Reschedule" : "Schedule"} Interview
              </Button>
            </Box>
          </Stack>
        </form>
      </Box>
    </CustomModal>
  );
}

export default React.memo(ScheduleInterviewModal);
