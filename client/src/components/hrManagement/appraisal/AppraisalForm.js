import React, { useContext } from "react";
import apiClient from "../../../config/axiosConfig";
import { useFormik } from "formik";
import Rating from "@mui/material/Rating";
import CustomButton from "../../customComponents/CustomButton";
import Grid from "@mui/material/Grid2";
import { validationSchema } from "../../../schemas/hrManagement/appraisals/appraisalSchema";
import { AlertContext } from "../../../contexts/AlertContext";
import FormikInputWrapper from "../../customComponents/InputWrapper";

function AppraisalForm() {
  const { setAlert } = useContext(AlertContext);

  const formik = useFormik({
    initialValues: {
      score: null,
      strengths: "",
      areasOfImprovement: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.post(`/add-appraisal`, values);

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
              : err.response.data.message,
          severity: "error",
        });
      }
    },
  });

  return (
    <form onSubmit={formik.handleSubmit}>
      <Grid container spacing={1}></Grid>
      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="strengths"
            placeholder="Strengths"
            formik={formik}
          />
        </Grid>
      </Grid>
      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="areasOfImprovement"
            placeholder="Areas of Improvement"
            formik={formik}
          />
        </Grid>
      </Grid>

      <h5>Performance Score</h5>

      <div className="form-field-container">
        <Rating
          name="score"
          value={formik.values.score}
          onChange={(event, newValue) => {
            formik.setFieldValue("score", newValue);
          }}
          onBlur={() => formik.setFieldTouched("score", true)}
        />
        {formik.touched.score && formik.errors.score && (
          <>
            <br />
            <small className="p-error">{formik.errors.score}</small>
          </>
        )}
      </div>

      <br />
      <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
    </form>
  );
}

export default React.memo(AppraisalForm);
