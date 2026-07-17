import { memo, useContext } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Grid from "@mui/material/Grid2";
import Assignment from "@mui/icons-material/Assignment";
import Schedule from "@mui/icons-material/Schedule";
import { useFormik } from "formik";
import Button from "@web/shared/components/Button";
import { validationSchema } from "./schemas";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import { API_ENDPOINTS } from "@web/shared/constants";

function AddHrActivity({ onSaved }) {
  const { setAlert } = useContext(AlertContext);

  const formik = useFormik({
    initialValues: {
      title: "",
      description: "",
      date: "",
      time: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.post(API_ENDPOINTS.ADD_HR_ACTIVITY, values);
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        formik.resetForm();
        onSaved?.();
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response.data.message,
          severity: "error",
        });
      }
    },
  });

  return (
    <Card sx={{ maxWidth: 600, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* Activity Details */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Assignment sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Activity Details
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={12}>
                    <FormikInputWrapper
                      type="text"
                      name="title"
                      placeholder="Activity Title"
                      formik={formik}
                    />
                  </Grid>
                  <Grid size={12}>
                    <FormikInputWrapper
                      type="text"
                      name="description"
                      placeholder="Description"
                      formik={formik}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Schedule */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Schedule sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Schedule
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="date"
                      name="date"
                      placeholder="Date"
                      formik={formik}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="time"
                      name="time"
                      placeholder="Time"
                      formik={formik}
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
                    minWidth: 150,
                    textTransform: "none",
                    fontWeight: "500",
                  }}
                >
                  Create Activity
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default memo(AddHrActivity);
