import { memo, useContext } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Rating from "@mui/material/Rating";

import Grid from "@mui/material/Grid2";
import Feedback from "@mui/icons-material/Feedback";
import Star from "@mui/icons-material/Star";
import Comment from "@mui/icons-material/Comment";
import ExitToApp from "@mui/icons-material/ExitToApp";
import { useFormik } from "formik";
import Button from "@web/shared/components/Button";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import { validationSchema } from "./schemas";
import { API_ENDPOINTS } from "@web/shared/constants";

function ExitFeedbackForm() {
  const { setAlert } = useContext(AlertContext);

  const formik = useFormik({
    initialValues: {
      overall_job_satisfaction: 0,
      quality_of_communication: "",
      support_from_manager: "",
      appreciation_for_work: "",
      collaboration_within_the_team: "",
      overall_company_culture: "",
      suggestions: "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const res = await apiClient.post(
          API_ENDPOINTS.ADD_EXIT_FEEDBACK,
          values,
        );
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
    <Card sx={{ maxWidth: 800, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <ExitToApp color="primary" />
          <Typography variant="h6" fontWeight="600">
            Exit Feedback
          </Typography>
        </Box>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* Feedback Questions */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Feedback sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Experience Feedback
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="quality_of_communication"
                      placeholder="Quality of Communication"
                      formik={formik}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="support_from_manager"
                      placeholder="Support from Manager"
                      formik={formik}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="appreciation_for_work"
                      placeholder="Appreciation for Work"
                      formik={formik}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="collaboration_within_the_team"
                      placeholder="Team Collaboration"
                      formik={formik}
                    />
                  </Grid>
                  <Grid size={12}>
                    <FormikInputWrapper
                      type="text"
                      name="overall_company_culture"
                      placeholder="Overall Company Culture"
                      formik={formik}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Overall Rating */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Star sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Overall Satisfaction
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={2} sx={{ py: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Overall Job Satisfaction
                  </Typography>
                  <Rating
                    name="overall_job_satisfaction"
                    value={formik.values.overall_job_satisfaction}
                    onChange={(event, newValue) => {
                      formik.setFieldValue(
                        "overall_job_satisfaction",
                        newValue,
                      );
                    }}
                    onBlur={() =>
                      formik.setFieldTouched("overall_job_satisfaction", true)
                    }
                    size="large"
                    sx={{
                      "& .MuiRating-iconFilled": {
                        color: "#ffa726",
                      },
                      "& .MuiRating-iconHover": {
                        color: "#ff9800",
                      },
                    }}
                  />
                  {formik.values.overall_job_satisfaction > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {formik.values.overall_job_satisfaction}/5
                    </Typography>
                  )}
                </Box>
                {formik.touched.overall_job_satisfaction &&
                  formik.errors.overall_job_satisfaction && (
                    <Typography
                      variant="caption"
                      color="error"
                      sx={{ mt: 0.5, display: "block" }}
                    >
                      {formik.errors.overall_job_satisfaction}
                    </Typography>
                  )}
              </Paper>
            </Grid>

            {/* Suggestions */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Comment sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Additional Comments
                  </Typography>
                </Box>
                <FormikInputWrapper
                  type="text"
                  name="suggestions"
                  placeholder="Your suggestions and feedback"
                  formik={formik}
                />
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
                  }}
                >
                  Submit Feedback
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default memo(ExitFeedbackForm);
