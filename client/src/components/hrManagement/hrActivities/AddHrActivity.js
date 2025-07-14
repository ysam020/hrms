import React, { useContext } from "react";
import { useFormik } from "formik";
import CustomButton from "../../customComponents/CustomButton";
import { validationSchema } from "../../../schemas/hrManagement/hrActivitiesSchema";
import { AlertContext } from "../../../contexts/AlertContext";
import apiClient from "../../../config/axiosConfig";
import Grid from "@mui/material/Grid2";
import FormikInputWrapper from "../../customComponents/InputWrapper";

function AddHrActivity() {
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
        const res = await apiClient.post(`/add-hr-activity`, values);
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
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="title"
            placeholder="Title"
            formik={formik}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="description"
            placeholder="Description"
            formik={formik}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={6}>
          <FormikInputWrapper
            type="date"
            name="date"
            placeholder="Date"
            formik={formik}
          />
        </Grid>

        <Grid size={6}>
          <FormikInputWrapper
            type="time"
            name="time"
            placeholder="Time"
            formik={formik}
          />
        </Grid>
      </Grid>

      <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
    </form>
  );
}

export default React.memo(AddHrActivity);
