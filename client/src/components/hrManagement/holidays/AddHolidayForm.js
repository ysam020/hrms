import { useFormik } from "formik";
import * as Yup from "yup";
import FormikInputWrapper from "../../customComponents/InputWrapper";
import Grid from "@mui/material/Grid2";
import CustomButton from "../../customComponents/CustomButton";
import apiClient from "../../../config/axiosConfig";
import { AlertContext } from "../../../contexts/AlertContext";
import { useContext } from "react";

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  date: Yup.date().required("Date is required").typeError("Invalid date"),
});

function AddHolidayForm(props) {
  const { setAlert } = useContext(AlertContext);

  const formik = useFormik({
    initialValues: { name: "", date: "" },
    validationSchema,
    onSubmit: async (values) => {
      try {
        await apiClient.post("/add-holiday", values);
        props.getHolidays();
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
      <br />
      <Grid container spacing={1}>
        <Grid size={{ xs: 12, sm: 12, md: 4, lg: 4 }}>
          <FormikInputWrapper
            type="text"
            name="name"
            placeholder="Name"
            formik={formik}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 12, md: 4, lg: 4 }}>
          <FormikInputWrapper
            type="date"
            name="date"
            placeholder="Date"
            formik={formik}
            inputProps={{
              minDate: new Date(),
              dateFormat: "dd/mm/yy",
              showIcon: true,
              showButtonBar: true,
            }}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
        </Grid>
      </Grid>
    </form>
  );
}

export default AddHolidayForm;
