import React, { useContext } from "react";
import { useFormik } from "formik";
import CustomButton from "../../customComponents/CustomButton";
import { AlertContext } from "../../../contexts/AlertContext";
import apiClient from "../../../config/axiosConfig";
import UserAutoComplete from "../../customComponents/UserAutoComplete";
import Grid from "@mui/material/Grid2";
import FormikInputWrapper from "../../customComponents/InputWrapper";
import { validationSchema } from "../../../schemas/hrManagement/trainingAndDevelopment";

function TrainingForm() {
  const { setAlert } = useContext(AlertContext);

  const formik = useFormik({
    initialValues: {
      username: "",
      trainingProgram: "",
      trainingDate: "",
      duration: "",
      trainingProvider: "",
      feedback: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.post(`/add-training`, values);

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
      <Grid container spacing={1}>
        <Grid size={6}>
          <UserAutoComplete formik={formik} />
        </Grid>

        <Grid size={6}>
          <FormikInputWrapper
            type="text"
            name="trainingProgram"
            placeholder="Training Program"
            formik={formik}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={6}>
          <FormikInputWrapper
            type="date"
            name="trainingDate"
            placeholder="Training Date"
            formik={formik}
            inputProps={{
              dateFormat: "dd/mm/yy",
              showIcon: true,
              showButtonBar: true,
            }}
          />
        </Grid>

        <Grid size={6}>
          <FormikInputWrapper
            type="text"
            name="duration"
            placeholder="Training Duration (in hours)"
            formik={formik}
            inputProps={{ keyfilter: "int" }}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="trainingProvider"
            placeholder="Training Provider"
            formik={formik}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="feedback"
            placeholder="Feedback"
            formik={formik}
          />
        </Grid>
      </Grid>

      <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
    </form>
  );
}

export default React.memo(TrainingForm);
