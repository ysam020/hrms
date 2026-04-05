import React, { useContext } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Grid from "@mui/material/Grid2";
import AccessTime from "@mui/icons-material/AccessTime";
import Person from "@mui/icons-material/Person";
import Edit from "@mui/icons-material/Edit";
import { useFormik } from "formik";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import UserAutoComplete from "@web/shared/components/UserAutoComplete";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import { z } from "zod";
import { toFormikValidationSchema } from "zod-formik-adapter";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

const validationSchema = toFormikValidationSchema(
  z.object({
    username: z.string().min(1, "Username is required"),
  }),
);

function AttendanceCorrection() {
  const { setAlert } = useContext(AlertContext);

  const formik = useFormik({
    initialValues: {
      username: "",
      timeIn: "",
      timeOut: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.put(
          API_ENDPOINTS.ATTENDANCE_CORRECTION,
          values,
        );
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        formik.resetForm();
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

  return (
    <Card sx={{ maxWidth: 600, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <Edit color="primary" />
          <Typography variant="h6" fontWeight="600">
            Attendance Correction
          </Typography>
        </Box>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* User Selection */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Person sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Employee
                  </Typography>
                </Box>
                <UserAutoComplete formik={formik} />
              </Paper>
            </Grid>

            {/* Time Fields */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <AccessTime sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Time Correction
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="time"
                      name="timeIn"
                      placeholder="Time In"
                      formik={formik}
                      inputProps={{
                        hourFormat: "12",
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="time"
                      name="timeOut"
                      placeholder="Time Out"
                      formik={formik}
                      inputProps={{
                        showIcon: true,
                        hourFormat: "12",
                      }}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Submit */}
            <Grid size={12}>
              <Box display="flex" justifyContent="center">
                <Button
                  type="submit"
                  disabled={formik.isSubmitting}
                  sx={{
                    minWidth: 160,
                    textTransform: "none",
                    fontWeight: "500",
                    ml: 1,
                  }}
                >
                  Update Attendance
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default React.memo(AttendanceCorrection);
