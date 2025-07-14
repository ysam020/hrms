import React, { useContext } from "react";
import { useFormik } from "formik";
import CustomButton from "../../customComponents/CustomButton";
import { AlertContext } from "../../../contexts/AlertContext";
import apiClient from "../../../config/axiosConfig";
import Grid from "@mui/material/Grid2";
import FormikInputWrapper from "../../customComponents/InputWrapper";
import { validationSchema } from "../../../schemas/hrManagement/exitFeedback";
import Rating from "@mui/material/Rating";

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
        const res = await apiClient.post(`/add-exit-feedback`, values);

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
    <form onSubmit={formik.handleSubmit}>
      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="quality_of_communication"
            placeholder="Quality of Communication"
            formik={formik}
          />
        </Grid>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="support_from_manager"
            placeholder="Support from Manager"
            formik={formik}
          />
        </Grid>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="appreciation_for_work"
            placeholder="Appreciation for Work"
            formik={formik}
          />
        </Grid>
      </Grid>
      <Grid container spacing={1}>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="collaboration_within_the_team"
            placeholder="Collaboration within the Team"
            formik={formik}
          />
        </Grid>
        <Grid size={4}>
          <FormikInputWrapper
            type="text"
            name="overall_company_culture"
            placeholder="Overall Company Culture"
            formik={formik}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="suggestions"
            placeholder="Suggestions"
            formik={formik}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={{ xs: 4, sm: 4, md: 4, lg: 4 }}>
          Overall job satisfaction
          <br />
          <Rating
            name="overall_job_satisfaction"
            value={formik.values.overall_job_satisfaction}
            onChange={(event, newValue) => {
              formik.setFieldValue("overall_job_satisfaction", newValue);
            }}
          />
          {formik.touched.overall_job_satisfaction &&
            formik.errors.overall_job_satisfaction && (
              <div className="p-error">
                {formik.errors.overall_job_satisfaction}
              </div>
            )}
        </Grid>
      </Grid>

      <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
    </form>
  );
}

export default React.memo(ExitFeedbackForm);
