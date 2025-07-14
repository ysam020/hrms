import React, { useContext } from "react";
import Grid from "@mui/material/Grid2";
import { useFormik } from "formik";
import CustomButton from "../../customComponents/CustomButton";
import { AlertContext } from "../../../contexts/AlertContext";
import apiClient from "../../../config/axiosConfig";
import UserAutoComplete from "../../customComponents/UserAutoComplete";
import FormikInputWrapper from "../../customComponents/InputWrapper";
import * as Yup from "yup";

const validationSchema = Yup.object({
  username: Yup.string().required("Username is required"),
});

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
        const res = await apiClient.put(`/attendance-correction`, values);

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
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
      <UserAutoComplete formik={formik} />
      <br />
      <Grid container spacing={1}>
        <Grid size={{ xs: 4, sm: 4, md: 4, lg: 6 }}>
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

        <Grid size={{ xs: 4, sm: 4, md: 4, lg: 6 }}>
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
      <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
    </form>
  );
}

export default React.memo(AttendanceCorrection);
