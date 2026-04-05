import React, { useContext, useState, useRef } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid2";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Snackbar from "@mui/material/Snackbar";
import CalendarToday from "@mui/icons-material/CalendarToday";
import EventNote from "@mui/icons-material/EventNote";
import Info from "@mui/icons-material/Info";
import LocalHospital from "@mui/icons-material/LocalHospital";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { useFormik } from "formik";
import { validationSchema } from "./schemas";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import FormikFileUploadWrapper from "@web/shared/components/FileUploadWrapper";
import DropdownWrapper from "@web/shared/components/DropdownWrapper";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

function LeaveApplication() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const [sickLeave, setIsSickLeave] = useState(false);
  const [fileSnackbar, setFileSnackbar] = useState(false);

  const fileUploadRef = useRef(null);

  // Fetch available paid leaves
  const { data: paidLeavesData } = useFetchData(
    "/get-available-paid-leaves",
    "get",
    [user],
    null,
    null,
  );

  // Extract available paid leaves from the fetched data
  const availablePaidLeaves = paidLeavesData?.remainingPaidLeaves || 0;

  const formik = useFormik({
    initialValues: {
      from: "",
      to: "",
      reason: "",
      leaveType: "",
      sick_leave: false,
      medicalCertificate: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.post(API_ENDPOINTS.ADD_LEAVE, values);
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        formik.resetForm();
        setIsSickLeave(false);
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response.data.message,
          severity: "error",
        });
      }
    },
  });

  const handleSickLeaveChange = (event) => {
    const checked = event.target.checked;
    setIsSickLeave(checked);
    formik.setFieldValue("sick_leave", checked);

    // Clear medical certificate if unchecked
    if (!checked) {
      formik.setFieldValue("medicalCertificate", "");
    }
  };

  return (
    <Card sx={{ maxWidth: 800, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        {/* Header */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mb={2}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <EventNote color="primary" />
            <Typography variant="h6" fontWeight="600">
              Leave Application
            </Typography>
          </Box>
          <Chip
            icon={<Info />}
            label={`${availablePaidLeaves} paid leave(s) available`}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Box>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* Date Fields */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <CalendarToday
                    sx={{ fontSize: 18, color: "text.secondary" }}
                  />
                  <Typography variant="subtitle2" fontWeight="500">
                    Leave Duration
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="date"
                      name="from"
                      placeholder="Start Date"
                      formik={formik}
                      inputProps={{
                        minDate: new Date(),
                        dateFormat: "dd/mm/yy",
                        showIcon: true,
                        showButtonBar: true,
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="date"
                      name="to"
                      placeholder="End Date"
                      formik={formik}
                      inputProps={{
                        minDate: new Date(),
                        dateFormat: "dd/mm/yy",
                        showIcon: true,
                        showButtonBar: true,
                      }}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Leave Details */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <EventNote sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Details
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <FormikInputWrapper
                      type="text"
                      name="reason"
                      placeholder="Reason for leave (min 5 characters)"
                      formik={formik}
                    />
                    <Typography
                      variant="caption"
                      color={
                        formik.values.reason.length < 5
                          ? "text.secondary"
                          : "success.main"
                      }
                      sx={{ display: "block", textAlign: "right", mt: 0.5 }}
                    >
                      {formik.values.reason.length} character
                      {formik.values.reason.length !== 1 ? "s" : ""}
                      {formik.values.reason.length < 5 ? " (5 minimum)" : ""}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <DropdownWrapper
                      name="leaveType"
                      options={[
                        { label: "PL", value: "PL" },
                        { label: "LWP", value: "LWP" },
                      ]}
                      placeholder="Leave Type"
                      formik={formik}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Sick Leave Section */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <LocalHospital
                    sx={{ fontSize: 18, color: "text.secondary" }}
                  />
                  <Typography variant="subtitle2" fontWeight="500">
                    Medical Information
                  </Typography>
                </Box>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={sickLeave}
                      onChange={handleSickLeaveChange}
                      name="sickLeave"
                      color="primary"
                    />
                  }
                  label="This is a sick leave"
                  sx={{ mb: sickLeave ? 1.5 : 0 }}
                />

                {/* Conditional File Upload */}
                {sickLeave && (
                  <Grid container spacing={1.5}>
                    <Grid size={12}>
                      <FormikFileUploadWrapper
                        name="medicalCertificate"
                        folderName="leave_medical_certificates"
                        label="Medical Certificate"
                        formik={formik}
                        fileUploadRef={fileUploadRef}
                        accept="image/*,application/pdf"
                        setFileSnackbar={setFileSnackbar}
                        username={user?.username}
                      />
                    </Grid>
                  </Grid>
                )}
              </Paper>
            </Grid>

            {/* Submit */}
            <Grid size={12}>
              <Box display="flex" justifyContent="center">
                <Button
                  type="submit"
                  disabled={formik.isSubmitting}
                  loading={formik.isSubmitting}
                  loadingText="Submitting..."
                >
                  Submit Application
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>

        <Snackbar
          open={fileSnackbar}
          autoHideDuration={4000}
          onClose={() => setFileSnackbar(false)}
          message="Medical certificate uploaded successfully!"
          sx={{
            left: "auto !important",
            right: "24px !important",
            "& .MuiSnackbarContent-root": {
              backgroundColor: "#10b981",
              borderRadius: "8px",
              fontWeight: "500",
            },
          }}
        />
      </CardContent>
    </Card>
  );
}

export default React.memo(LeaveApplication);
