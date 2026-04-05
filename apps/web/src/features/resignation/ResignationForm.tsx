import React, { useContext } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Grid from "@mui/material/Grid2";
import ExitToApp from "@mui/icons-material/ExitToApp";
import Comment from "@mui/icons-material/Comment";
import { useFormik } from "formik";
import Button from "@web/shared/components/Button";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import { z } from "zod";
import { toFormikValidationSchema } from "zod-formik-adapter";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import { API_ENDPOINTS } from "@web/shared/constants";

const validationSchema = toFormikValidationSchema(
  z.object({
    reason: z
      .string()
      .trim()
      .min(
        10,
        "Please provide a more detailed reason (at least 10 characters)",
      ),
  }),
);

function ResignationForm() {
  const { setAlert } = useContext(AlertContext);

  const formik = useFormik({
    initialValues: {
      reason: "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const res = await apiClient.post(API_ENDPOINTS.ADD_RESIGNATION, values);
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        resetForm();
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
          <ExitToApp color="primary" />
          <Typography variant="h6" fontWeight="600">
            Resignation Request
          </Typography>
        </Box>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* Resignation Reason */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Comment sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Resignation Details
                  </Typography>
                </Box>
                <FormikInputWrapper
                  type="text"
                  name="reason"
                  placeholder="Please provide your reason for resignation (minimum 10 characters)"
                  formik={formik}
                />
                <Typography
                  variant="caption"
                  color={
                    formik.values.reason.length < 10
                      ? "text.secondary"
                      : "success.main"
                  }
                  sx={{ display: "block", textAlign: "right", mt: 0.5 }}
                >
                  {formik.values.reason.length} character
                  {formik.values.reason.length !== 1 ? "s" : ""}
                  {formik.values.reason.length < 10 ? " (10 minimum)" : ""}
                </Typography>
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
                  sx={{
                    minWidth: 160,
                    textTransform: "none",
                    fontWeight: "500",
                  }}
                >
                  Submit Resignation
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default React.memo(ResignationForm);
